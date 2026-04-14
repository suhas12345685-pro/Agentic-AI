# Skill: LLM Router

## Description
Routes queries to the optimal LLM based on task classification. Zero extra API calls — uses heuristic classifier.

## Trigger
Every incoming query passes through the router.

## Models
- **DeepSeek R1 7B**: Complex reasoning (default)
- **DeepSeek Coder 7B**: Code-related tasks
- **Qwen 2.5 3B**: Quick/simple responses
- **LLaVA**: Vision/image tasks
- **HuggingFace API**: Fallback when Ollama is offline

## Phase
P1 — Foundation
