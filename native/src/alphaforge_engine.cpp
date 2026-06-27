// AlphaForge Native Engine
// ---------------------------------------------------------------------------
// A dependency-free C++14 microservice that sits on the Python <-> ML boundary.
// It does two performance-sensitive jobs:
//   1. FEATURES  - turn a raw order-book + trade window into a fixed feature
//                  vector (order-flow imbalance, micro-price, depth imbalance,
//                  realized vol, RSI, EMA ratio, trade-sign imbalance, ...).
//   2. PREDICT   - evaluate a LightGBM gradient-boosted tree ensemble that was
//                  exported in LightGBM's text format (`model.txt`). We parse
//                  the trees ourselves and traverse them for low-latency
//                  inference - no Python, no LightGBM runtime required.
//
// It speaks a compact, newline-delimited, whitespace-tokenised protocol over
// stdin/stdout so it works as a subprocess of the Python serving layer. This
// avoids any Python-ABI / bitness coupling (it builds with a plain g++).
//
// Protocol (one request per line, one response per line):
//   PING
//       -> OK pong
//   FEATURES <nb> b0p b0q .. <na> a0p a0q .. <nt> t0p t0q t0s ..
//       bids best-first (desc price), asks best-first (asc price),
//       trades oldest-first, side = +1 buy / -1 sell.
//       -> OK <k> f0 f1 .. f(k-1)
//   LOAD <path-to-model.txt>
//       -> OK <num_trees> <num_features>   |   ERR <message>
//   PREDICT <k> f0 f1 .. f(k-1)
//       -> OK <probability> <raw_margin>   |   ERR <message>
//   QUIT
//       -> (exits)
//
// The feature order MUST stay in lock-step with ml/features/schema.py.
// ---------------------------------------------------------------------------

#include <iostream>
#include <sstream>
#include <fstream>
#include <string>
#include <vector>
#include <cmath>
#include <cstdint>
#include <limits>

namespace {

constexpr int kNumFeatures = 13;

// ---------------------------------------------------------------------------
// Small numeric helpers
// ---------------------------------------------------------------------------
double safeDiv(double a, double b) { return (b == 0.0) ? 0.0 : a / b; }

double meanOf(const std::vector<double>& v) {
    if (v.empty()) return 0.0;
    double s = 0.0;
    for (double x : v) s += x;
    return s / static_cast<double>(v.size());
}

double emaOf(const std::vector<double>& p, int period) {
    const int n = static_cast<int>(p.size());
    if (n < period || period <= 0) return std::numeric_limits<double>::quiet_NaN();
    const double k = 2.0 / (period + 1.0);
    double seed = 0.0;
    for (int i = 0; i < period; ++i) seed += p[i];
    double val = seed / period;
    for (int i = period; i < n; ++i) val = p[i] * k + val * (1.0 - k);
    return val;
}

// Wilder-style RSI matching the existing TypeScript heuristic, returned 0..100.
double rsiOf(const std::vector<double>& p, int period) {
    const int n = static_cast<int>(p.size());
    if (n < period + 1) return 50.0;  // neutral when not enough data
    double gains = 0.0, losses = 0.0;
    for (int i = n - period; i < n; ++i) {
        const double d = p[i] - p[i - 1];
        if (d > 0) gains += d; else losses -= d;
    }
    if (losses == 0.0) return 100.0;
    const double rs = (gains / period) / (losses / period);
    return 100.0 - 100.0 / (1.0 + rs);
}

// ---------------------------------------------------------------------------
// Feature extraction
// ---------------------------------------------------------------------------
struct Level { double price; double qty; };
struct TradeTick { double price; double qty; double side; };

std::vector<double> computeFeatures(const std::vector<Level>& bids,
                                    const std::vector<Level>& asks,
                                    const std::vector<TradeTick>& trades) {
    std::vector<double> f(kNumFeatures, 0.0);

    const bool haveBid = !bids.empty();
    const bool haveAsk = !asks.empty();
    const double bestBid = haveBid ? bids.front().price : 0.0;
    const double bestAsk = haveAsk ? asks.front().price : 0.0;

    double mid = 0.0;
    if (haveBid && haveAsk) mid = 0.5 * (bestBid + bestAsk);
    else if (haveBid)       mid = bestBid;
    else if (haveAsk)       mid = bestAsk;

    const double spread = (haveBid && haveAsk) ? (bestAsk - bestBid) : 0.0;
    const double bidQ1 = haveBid ? bids.front().qty : 0.0;
    const double askQ1 = haveAsk ? asks.front().qty : 0.0;

    // 0: relative spread
    f[0] = safeDiv(spread, mid);

    // 1: micro-price deviation from mid (size-weighted fair price tilt)
    if (bidQ1 + askQ1 > 0.0 && mid > 0.0) {
        const double micro = (bestBid * askQ1 + bestAsk * bidQ1) / (bidQ1 + askQ1);
        f[1] = (micro - mid) / mid;
    }

    // 2: L1 order-flow imbalance
    f[2] = safeDiv(bidQ1 - askQ1, bidQ1 + askQ1);

    // 3: depth imbalance over up to 5 levels
    double sumBid5 = 0.0, sumAsk5 = 0.0;
    for (int i = 0; i < 5 && i < static_cast<int>(bids.size()); ++i) sumBid5 += bids[i].qty;
    for (int i = 0; i < 5 && i < static_cast<int>(asks.size()); ++i) sumAsk5 += asks[i].qty;
    f[3] = safeDiv(sumBid5 - sumAsk5, sumBid5 + sumAsk5);

    // 4/5: book slope (steepness of the bid/ask ladder, normalized by mid)
    if (bids.size() >= 2 && mid > 0.0) {
        const double drop = bids.front().price - bids.back().price;
        f[4] = drop / (mid * (bids.size() - 1));
    }
    if (asks.size() >= 2 && mid > 0.0) {
        const double rise = asks.back().price - asks.front().price;
        f[5] = rise / (mid * (asks.size() - 1));
    }

    // Trade-derived features
    std::vector<double> prices;
    prices.reserve(trades.size());
    for (const auto& t : trades) prices.push_back(t.price);

    // 6: realized volatility (std of simple returns)
    if (prices.size() >= 2) {
        std::vector<double> rets;
        rets.reserve(prices.size() - 1);
        for (size_t i = 1; i < prices.size(); ++i)
            rets.push_back(safeDiv(prices[i] - prices[i - 1], prices[i - 1]));
        const double m = meanOf(rets);
        double var = 0.0;
        for (double r : rets) var += (r - m) * (r - m);
        var /= rets.size();
        f[6] = std::sqrt(var);
    }

    // 7: RSI(14) scaled to 0..1
    f[7] = rsiOf(prices, 14) / 100.0;

    // 8: EMA(8)/EMA(21) - 1 momentum ratio
    {
        const double e8 = emaOf(prices, 8);
        const double e21 = emaOf(prices, 21);
        if (!std::isnan(e8) && !std::isnan(e21) && e21 != 0.0) f[8] = e8 / e21 - 1.0;
    }

    // 9: signed trade-volume imbalance
    {
        double signedVol = 0.0, totVol = 0.0;
        for (const auto& t : trades) { signedVol += t.side * t.qty; totVol += t.qty; }
        f[9] = safeDiv(signedVol, totVol);
    }

    // 10: trade intensity (count normalized into 0..1)
    f[10] = std::min(static_cast<double>(trades.size()) / 50.0, 1.0);

    // 11: mean trade size
    {
        double tot = 0.0;
        for (const auto& t : trades) tot += t.qty;
        f[11] = safeDiv(tot, static_cast<double>(trades.size()));
    }

    // 12: window price momentum
    if (prices.size() >= 2 && prices.front() != 0.0)
        f[12] = prices.back() / prices.front() - 1.0;

    return f;
}

// ---------------------------------------------------------------------------
// LightGBM text-model parser + tree-traversal inference
// ---------------------------------------------------------------------------
struct Tree {
    std::vector<int>    split_feature;
    std::vector<double> threshold;
    std::vector<int>    left_child;
    std::vector<int>    right_child;
    std::vector<double> leaf_value;
};

class GBDTModel {
public:
    bool loaded() const { return loaded_; }
    int  numTrees() const { return static_cast<int>(trees_.size()); }
    int  numFeatures() const { return max_feature_idx_ + 1; }

    bool load(const std::string& path, std::string& err) {
        std::ifstream in(path.c_str());
        if (!in) { err = "cannot open " + path; return false; }

        trees_.clear();
        max_feature_idx_ = 0;
        Tree cur;
        bool inTree = false;

        std::string line;
        while (std::getline(in, line)) {
            if (!line.empty() && line.back() == '\r') line.pop_back();
            if (line.empty()) continue;

            const size_t eq = line.find('=');
            const std::string key = (eq == std::string::npos) ? line : line.substr(0, eq);
            const std::string val = (eq == std::string::npos) ? ""   : line.substr(eq + 1);

            // LightGBM writes one "Tree=<n>" line per tree.
            if (key == "Tree") {
                if (inTree) trees_.push_back(cur);
                cur = Tree();
                inTree = true;
            } else if (key == "max_feature_idx") {
                max_feature_idx_ = std::max(max_feature_idx_, parseInt(val));
            } else if (inTree) {
                if      (key == "split_feature") cur.split_feature = parseInts(val);
                else if (key == "threshold")     cur.threshold     = parseDoubles(val);
                else if (key == "left_child")    cur.left_child    = parseInts(val);
                else if (key == "right_child")   cur.right_child   = parseInts(val);
                else if (key == "leaf_value")    cur.leaf_value    = parseDoubles(val);
            }
        }
        if (inTree) trees_.push_back(cur);

        if (trees_.empty()) { err = "no trees parsed from model"; return false; }
        loaded_ = true;
        return true;
    }

    // Returns probability via sigmoid of the summed leaf margins.
    double predict(const std::vector<double>& feats, double& rawOut) const {
        double raw = 0.0;
        for (const Tree& t : trees_) raw += traverse(t, feats);
        rawOut = raw;
        return 1.0 / (1.0 + std::exp(-raw));
    }

private:
    static double traverse(const Tree& t, const std::vector<double>& feats) {
        if (t.left_child.empty()) {
            // Degenerate single-leaf tree
            return t.leaf_value.empty() ? 0.0 : t.leaf_value[0];
        }
        int node = 0;
        // Guard against malformed loops with a generous bound.
        for (int guard = 0; guard < 1 << 20; ++guard) {
            const int feat = t.split_feature[node];
            const double thr = t.threshold[node];
            const double x = (feat >= 0 && feat < static_cast<int>(feats.size())) ? feats[feat] : 0.0;
            const int child = (x <= thr) ? t.left_child[node] : t.right_child[node];
            if (child < 0) return t.leaf_value[~child];  // leaf index = ~child
            node = child;
        }
        return 0.0;
    }

    static int parseInt(const std::string& s) {
        try { return std::stoi(s); } catch (...) { return 0; }
    }
    static std::vector<int> parseInts(const std::string& s) {
        std::vector<int> out; std::istringstream ss(s); std::string tok;
        while (ss >> tok) { try { out.push_back(std::stoi(tok)); } catch (...) {} }
        return out;
    }
    static std::vector<double> parseDoubles(const std::string& s) {
        std::vector<double> out; std::istringstream ss(s); std::string tok;
        while (ss >> tok) { try { out.push_back(std::stod(tok)); } catch (...) {} }
        return out;
    }

    std::vector<Tree> trees_;
    int  max_feature_idx_ = 0;
    bool loaded_ = false;
};

// ---------------------------------------------------------------------------
// Request loop
// ---------------------------------------------------------------------------
void handleFeatures(std::istringstream& ss) {
    auto readLevels = [&](int n) {
        std::vector<Level> v; v.reserve(n);
        for (int i = 0; i < n; ++i) { Level l{0, 0}; ss >> l.price >> l.qty; v.push_back(l); }
        return v;
    };

    int nb = 0; ss >> nb; auto bids = readLevels(nb);
    int na = 0; ss >> na; auto asks = readLevels(na);
    int nt = 0; ss >> nt;
    std::vector<TradeTick> trades; trades.reserve(nt);
    for (int i = 0; i < nt; ++i) { TradeTick t{0, 0, 0}; ss >> t.price >> t.qty >> t.side; trades.push_back(t); }

    const std::vector<double> f = computeFeatures(bids, asks, trades);
    std::ostringstream out;
    out << "OK " << f.size();
    out.setf(std::ios::scientific);
    out.precision(9);
    for (double v : f) out << ' ' << v;
    std::cout << out.str() << '\n' << std::flush;
}

}  // namespace

int main() {
    std::ios::sync_with_stdio(false);
    GBDTModel model;
    std::string line;

    while (std::getline(std::cin, line)) {
        if (!line.empty() && line.back() == '\r') line.pop_back();
        std::istringstream ss(line);
        std::string cmd;
        ss >> cmd;
        if (cmd.empty()) continue;

        if (cmd == "PING") {
            std::cout << "OK pong\n" << std::flush;
        } else if (cmd == "QUIT" || cmd == "EXIT") {
            break;
        } else if (cmd == "FEATURES") {
            handleFeatures(ss);
        } else if (cmd == "LOAD") {
            std::string path; std::getline(ss, path);
            // trim leading spaces
            size_t a = path.find_first_not_of(" \t");
            if (a != std::string::npos) path = path.substr(a);
            std::string err;
            if (model.load(path, err))
                std::cout << "OK " << model.numTrees() << ' ' << model.numFeatures() << '\n' << std::flush;
            else
                std::cout << "ERR " << err << '\n' << std::flush;
        } else if (cmd == "PREDICT") {
            if (!model.loaded()) { std::cout << "ERR no_model\n" << std::flush; continue; }
            int k = 0; ss >> k;
            std::vector<double> feats(k, 0.0);
            for (int i = 0; i < k; ++i) ss >> feats[i];
            double raw = 0.0;
            const double p = model.predict(feats, raw);
            std::ostringstream out;
            out.setf(std::ios::scientific); out.precision(9);
            out << "OK " << p << ' ' << raw;
            std::cout << out.str() << '\n' << std::flush;
        } else {
            std::cout << "ERR unknown_command\n" << std::flush;
        }
    }
    return 0;
}
