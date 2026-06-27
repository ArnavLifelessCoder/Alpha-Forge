# Build the AlphaForge native engine (POSIX / MinGW make).
#   make            -> bin/alphaforge_engine[.exe]
#   make clean
CXX      ?= g++
CXXFLAGS ?= -O2 -std=c++14 -static -s
SRC       = src/alphaforge_engine.cpp

ifeq ($(OS),Windows_NT)
  BIN = bin/alphaforge_engine.exe
else
  BIN = bin/alphaforge_engine
endif

all: $(BIN)

$(BIN): $(SRC)
	@mkdir -p bin
	$(CXX) $(CXXFLAGS) -o $(BIN) $(SRC)
	@echo "Built $(BIN)"

clean:
	rm -rf bin

.PHONY: all clean
