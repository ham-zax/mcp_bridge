# Greenhouse application memory

Use this as reusable strategy, not as a substitute for the current page state.

## Form behavior

- Treat country/phone controls as semantic fields, not as a fixed sequence of keystrokes or refs.
- When selecting India for a phone field, verify both the selected country label and the `+91` calling code before continuing. At least one observed form exposed a misleading fuzzy match for British Indian Ocean Territory.
- Commit autocomplete selections explicitly and verify the chosen value after the control rerenders.
- Resume/file controls may be visually wrapped; identify the current upload control and verify its resulting filename/state.

## Submission

- Do not infer success only because the Submit button disappeared or the page rerendered.
- Require a positive Greenhouse confirmation state such as a visible "Thank you for applying" message or equivalent success page.
- If submit outcome is failed, partial, or unknown, observe/diagnose before any further action. Never replay an unknown submit automatically.

## Human-only boundaries

- Distinguish ordinary email/field validation from an explicit CAPTCHA, anti-spam control, or "prove you are human" challenge.
- Do not automate around explicit human-verification controls.
