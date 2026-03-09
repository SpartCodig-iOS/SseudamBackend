#!/bin/bash

# 모든 엔티티 파일의 속성에 ! 단언 추가
find src/entities -name "*.entity.ts" -exec sed -i '' 's/^\( *[a-zA-Z_][a-zA-Z0-9_]*\): /\1!: /g' {} \;