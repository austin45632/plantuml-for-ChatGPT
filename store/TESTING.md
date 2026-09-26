# Chrome Web Store test instructions

1. Install the extension and open https://chatgpt.com/.
2. Start a conversation and submit a message containing:

   ````markdown
   ```plantuml
   @startuml
   Alice -> Bob: hello
   Bob --> Alice: hi
   @enduml
   ```
   ````

3. Wait for the message to finish. The code block should become a diagram.
4. Verify the source toggle, SVG/PNG copy buttons, draft editor, and context
   menu.
5. Repeat in light and dark theme, and in a long conversation with history.
