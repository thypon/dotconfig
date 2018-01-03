#!/bin/bash
set -e
PROJECT=${1:-$HOME/Workspace/android/}
DIR=${PWD/$PROJECT/}
REPO=https://android.googlesource.com/platform/$DIR
git remote add android $REPO 2>/dev/null || git remote set-url android $REPO 2>/dev/null
git fetch android
