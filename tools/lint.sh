#!/usr/bin/env bash

cargo fmt
cargo clippy --fix --all-targets --all-features --allow-dirty
