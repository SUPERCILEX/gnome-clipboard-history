#!/usr/bin/env bash

cargo +nightly fmt
cargo +nightly clippy --fix --all-targets --all-features --allow-dirty
