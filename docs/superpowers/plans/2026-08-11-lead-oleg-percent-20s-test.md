# Lead Oleg Percent 20-Second User Test Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record and edit a 20-second real-screen user test showing how a Lead's net deal amount and Oleg's commission percentage change together.

**Architecture:** Use one disposable Lead on the authenticated test stand. The recording shows only the user-visible flow: create a Lead, enter `Deal net`, enable `Oleg commission`, enter `Oleg %`, save, change `Deal net`, save again, and show the updated values. Add short burned-in captions after recording and remove pauses before the final export.

**Tech Stack:** LightCrm test stand, Chrome Computer Use, macOS `screencapture`, FFmpeg if available, Markdown scenario.

## Global Constraints

- Use only the test stand and a disposable Lead; do not modify a real customer project.
- Keep the final video at or below 20 seconds.
- Show the formula in a caption: `commission = Deal net × Oleg % / 100`.
- Use values that make the change obvious: `Deal net = 50,000`, `Oleg % = 2`, then `Deal net = 60,000`.
- The expected commission changes from `1,000` to `1,200` when the calculation is enabled.
- Do not show email addresses, phone numbers, or other real personal data.

### Task 1: Prepare the disposable Lead

**Files:**
- No repository code changes.
- Test record: a newly created Lead on `http://204.168.163.99:3004/leads`.

- [ ] Open `Leads` and click `Create row`.
- [ ] Set the name to `QA Oleg commission demo` and leave contact fields empty.
- [ ] Open `Details`, confirm the `Commercial` block contains `Deal net`, `Oleg %`, and `Oleg commission enabled`.
- [ ] Confirm that this new Lead starts with `Oleg % = 2` and the commission switch enabled.

### Task 2: Capture the 20-second interaction

**Files:**
- Create: `/tmp/lightcrm-oleg-percent-raw.mov`

- [ ] Start a fixed-duration screen recording with the cursor and click indicators visible.
- [ ] Record the following timed sequence:
  - `0:00-0:03`: open the new Lead and point to the `Commercial` block.
  - `0:03-0:07`: enter `50,000` in `Deal net`, keep `Oleg % = 2`, show the enabled switch.
  - `0:07-0:10`: click `Save details` and pause briefly on the saved values.
  - `0:10-0:14`: replace `Deal net` with `60,000`.
  - `0:14-0:17`: save again and show the changed amount.
  - `0:17-0:20`: hold on the values and show the commission calculation caption.
- [ ] Do not click `Archive`, `В утиль`, `Delete`, or any production-facing action.

### Task 3: Verify the behavior after recording

**Files:**
- No repository code changes.

- [ ] Reopen the disposable Lead after the recording.
- [ ] Verify `Deal net = 60,000`, `Oleg % = 2`, and the commission switch remains enabled.
- [ ] Verify the UI does not create a second amount field or overwrite `Budget EUR`.
- [ ] Verify the result is understandable without audio.

### Task 4: Edit and deliver the guide

**Files:**
- Create: `/Users/olegpanyukov/Downloads/LightCrm-oleg-percent-20s-guide.mp4`

- [ ] Remove pauses and dead time from the raw recording.
- [ ] Add burned-in captions at the lower third:
  - `1. Deal net: 50,000`
  - `2. Oleg commission: ON · 2%`
  - `3. Save details`
  - `4. Deal net changed: 60,000`
  - `Commission: 50,000 × 2% = 1,000 → 60,000 × 2% = 1,200`
- [ ] Keep each caption on screen long enough to read, without covering the Commercial block.
- [ ] Export H.264 MP4 at the original screen aspect ratio, keeping the final duration at or below 20 seconds.
- [ ] Verify the exported file exists, opens, and contains the final save state.

## Acceptance Criteria

- A viewer can identify the three controls: `Deal net`, `Oleg %`, and `Oleg commission enabled`.
- The video visibly shows the amount changing from `50,000` to `60,000`.
- The percentage remains `2%` and the switch remains enabled.
- The caption explains the resulting commission change from `1,000` to `1,200`.
- The video is no longer than 20 seconds and contains no real customer data.
