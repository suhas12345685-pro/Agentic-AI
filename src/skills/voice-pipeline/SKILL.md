# Skill: Voice Pipeline

## Description
Speech-to-text → LLM → Text-to-speech pipeline. Deepgram for STT, ElevenLabs for TTS.

## Trigger
Voice input via microphone or VB-Audio Cable.

## Flow
1. Audio capture → Deepgram STT
2. Text → JARVIS brain (LLM router + ReAct)
3. Response text → ElevenLabs TTS
4. Audio output → Speaker

## Requirements
- Deepgram API key
- ElevenLabs API key
- VB-Audio Cable (Windows, for routing)

## Phase
P3 — Awareness
