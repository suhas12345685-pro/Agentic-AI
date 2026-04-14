"""
JARVIS — HuggingFace Space deployment
Runs the fine-tuned JARVIS model as a public Gradio interface.
"""

import os
import gradio as gr
from transformers import AutoModelForCausalLM, AutoTokenizer
import torch

MODEL_NAME = os.environ.get('JARVIS_MODEL', 'your-username/jarvis-r1-7b')

print(f'Loading JARVIS model: {MODEL_NAME}...')
tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
model = AutoModelForCausalLM.from_pretrained(
    MODEL_NAME,
    torch_dtype=torch.float16,
    device_map='auto',
)

ALPACA_PROMPT = '''Below is an instruction that describes a task. Write a response that appropriately completes the request.

### Instruction:
{}

### Response:
'''


def chat(message, history):
    """Generate a JARVIS response."""
    prompt = ALPACA_PROMPT.format(message)
    inputs = tokenizer(prompt, return_tensors='pt').to(model.device)

    outputs = model.generate(
        **inputs,
        max_new_tokens=512,
        do_sample=True,
        temperature=0.7,
        top_p=0.9,
        repetition_penalty=1.1,
        pad_token_id=tokenizer.eos_token_id,
    )

    response = tokenizer.decode(outputs[0][inputs['input_ids'].shape[1]:], skip_special_tokens=True)
    return response.strip()


demo = gr.ChatInterface(
    fn=chat,
    title='JARVIS — Just A Rather Very Intelligent System',
    description='An agentic AI assistant built on DeepSeek R1 7B. Built by Suhas, age 14, Hyderabad, India.',
    examples=[
        'What can you do?',
        'Explain async/await in JavaScript.',
        'What is the meaning of life?',
        'Tell me a joke.',
    ],
    theme='soft',
)

if __name__ == '__main__':
    demo.launch()
