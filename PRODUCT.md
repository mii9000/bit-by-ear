# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Self-directed learners who have a topic they want to understand and want to make steady progress with little daily effort. They can provide their current knowledge, goals, and source material, then listen in a browser or from the app saved to their mobile Home Screen.

## Product Purpose

Bit by Ear turns a learner's topic, context, and resources into a proposed learning plan and a sequence of short daily audio episodes. After the learner adjusts and approves the plan, the app automates episode preparation so learning can continue in small, low-effort listening sessions. The intended outcome is gradual familiarity over time; improved knowledge is a product hypothesis, not a measured claim.

## Positioning

The learning sequence is grounded in the learner's own material and delivered as connected, story-like audio: each episode briefly recalls the previous lesson and introduces a new concept. The learner reviews the plan once, then returns to a ready-to-play episode each day.

## Operating Context

Learners create a knowledge base, add resources and learning context, review and adjust the proposed plan, and approve it. They access generated episodes in the installable web app. Episode-ready push notifications are optional. The application is intended to run locally for development and on Render when deployed.

## Capabilities and Constraints

- The system proposes a learning plan; the learner can adjust and approve it.
- Episodes are informative narratives with a brief continuity recap and a new concept. They contain no questions or quizzes.
- Published audio must be no longer than two minutes.
- Episodes are generated and stored for listening in the app; email is not the delivery channel.
- The listening controls are play/pause and a draggable seek bar. Playback position is saved.
- Push notifications are optional and announce when an episode is ready.
- The interface is a Progressive Web App built with React and TypeScript. The backend uses TypeScript.
- OpenRouter with GLM 5.3 Flash generates plans and episode scripts; ElevenLabs generates narration. Render hosts the application and scheduled generation services.
- The product should automate recurring preparation while keeping plan approval in the learner's hands.

## Brand Commitments

The confirmed product name is **Bit by Ear**. The core message is **Small listens. Steady learning.**, reflecting the Hacktoberfest “Slow and Steady” theme through small listening sessions that gradually build understanding.

Use a warm, plain, patient voice. Invite curiosity without guilt, streak pressure, mastery promises, or calling learners lazy. Use knowledge base for the topic, context, and resources; learning plan for the outline; series for the connected sequence; and episode for each audio item. “Two minutes or less” is an audio duration limit, not a guaranteed learning outcome.

## Evidence on Hand

- The implementation and local setup instructions are in `README.md`.
- The product requirements and implementation decisions are recorded in `docs/superpowers/specs/2026-10-24-daily-learning-pwa-design.md` and `docs/superpowers/plans/2026-10-24-daily-learning-pwa.md`.
- The repository contains the React/TypeScript app, server, worker, and Render Blueprint. No user testimonials or measured learning outcomes are available; do not invent them.

## Product Principles

- Make daily learning require very little effort after initial setup.
- Ground plans and episodes in the learner's goal and supplied resources.
- Let the system propose and automate; let the learner adjust and approve.
- Keep each lesson short, connected, and useful to listen to.
- Treat the app library as the source of truth; notifications are optional reminders.
