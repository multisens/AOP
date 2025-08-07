#!/bin/bash

# This script starts Google Chrome with the specified URL or file.

if [[ "$(uname)" == "Darwin" ]]; then
  open -a "Google Chrome" $1
else
  google-chrome-stable $1
fi