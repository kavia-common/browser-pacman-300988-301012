#!/bin/bash
cd /home/kavia/workspace/code-generation/browser-pacman-300988-301012/pacman_frontend
npm run build
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
   exit 1
fi

