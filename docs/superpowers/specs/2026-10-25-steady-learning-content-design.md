# Bit by Ear: steady learning content

Status: Approved and implemented. Verification details are in the companion implementation plan.

## Intent

Express the Hacktoberfest “Slow and Steady” theme through the product's everyday language: brief listening sessions that gradually build understanding. The selected core message is **Small listens. Steady learning.** Keep Bit by Ear as the product name.

## Approaches considered

- **Steady listening — selected:** “Small listens. Steady learning.” Connects the theme directly to the audio format.
- **Gentle progress:** “A little wiser, day by day.” Warm, but less specific about the product.
- **Growing understanding:** “One idea today. More understanding tomorrow.” Makes accumulation explicit, but is longer and sounds more like an outcome promise.

## Voice

Warm, plain, patient, and informative. Invite curiosity and make the next action clear. Let the theme appear at meaningful moments rather than turning every label into a slogan. Avoid guilt, streak pressure, “falling behind,” mastery promises, guaranteed retention, or calling learners lazy. Keep errors and destructive actions direct.

“Two minutes or less” describes an episode's maximum duration; never imply that exactly two minutes of daily listening guarantees learning. Say “last time” in narration rather than assuming an episode was heard yesterday.

## Copy draft

| Moment | Proposed content |
| --- | --- |
| Brand line, page title, PWA description | Small listens. Steady learning. |
| Account headline | Something you've been meaning to learn. |
| Account introduction | Turn your own material into connected daily audio stories. One new idea at a time, in two minutes or less. |
| Account footer | A little listening, at your own pace. |
| Library headline | Small listens. Steady learning. |
| Library introduction | Explore what interests you through short daily episodes, shaped around your own material. |
| New knowledge base heading | What have you been meaning to learn? |
| New knowledge base introduction | Choose a topic. We'll help you explore it one idea at a time. |
| Name example | Understanding climate systems |
| Resource empty state | Add your notes or documents. We'll use them to plan a series of small, connected lessons. |
| Plan heading | Your learning plan |
| Plan empty heading | One idea at a time |
| Plan empty description | We'll arrange your material into small daily lessons, starting with what you already know. Review and adjust the plan before you begin. |
| Plan generation heading | Shaping your learning plan |
| Plan generation description | We're reading your material and putting the ideas in an order that builds gradually. |
| Plan duration label | Series length |
| Plan duration help | Choose how many daily episodes you'd like. Each explores one idea in two minutes or less. |
| Approval action | Approve this plan |
| Approval explanation | After your plan is checked, we'll prepare your first episode. The rest will follow daily at your scheduled time. |
| Episode collection eyebrow | One idea at a time |
| Episode collection heading | Your episodes |
| Player subtitle | One idea to explore, one small step forward. |
| Player listening hint | Two minutes or less. Listen at your own pace. |
| Player footer | Pick up where you left off, whenever you're ready. |
| Settings heading | Listening settings |
| Settings introduction | Set a rhythm that fits your day. |
| Daily schedule help | New episodes are prepared even when the app is closed. Listen whenever it suits you. |
| Pause explanation | Pause new episodes whenever you need to. Your existing episodes and listening position stay saved. |
| Resume action | Resume daily episodes |
| Pause action | Pause new episodes |
| Push title | Your next small step is ready |
| Push body | A new audio episode is waiting. Listen whenever you're ready. |
| App footer | Understanding grows, one idea at a time. |

## Terminology and factual accuracy

Use **knowledge base** for the learner's topic, context, and resources; **learning plan** for the editable outline; **series** for the connected sequence; and **episode** for the individual audio item. Use “lesson” naturally within explanations when it helps. Replace user-facing “course” labels with the appropriate term, while preserving internal course identifiers, database names, API routes, and types.

Do not promise automatic plan creation when the user must click “Create my plan.” Preserve upload limits, source transparency, validation details, and existing controls. Avoid promising exact audio readiness at a scheduled minute. Do not infer listening or comprehension from generation or elapsed days.

## Generated content

Plans should build gradually from the learner's current knowledge, with one manageable concept per episode. Narration should be patient, concrete, and connected: a short recap of what was explained before, followed by one useful new idea. Express the theme through pacing and continuity, without repeating brand slogans, adding motivational filler, or consuming narration time with generic encouragement. Preserve grounding, source validation, duration checks, and the ban on questions and quizzes.

Prompt changes affect newly generated content. Do not overwrite existing approved plans, episode scripts, or audio.

## Scope and verification

Update PRODUCT.md, README introduction, document metadata, PWA metadata, onboarding, library, plan and episode screens, listening settings, notification payloads and their service-worker fallback, and generation prompts/mock examples. Keep technical documentation and error recovery language factual. Preserve the current layout and styling; visual and UX polish is the next phase.

Verify terminology and old tagline removal across these surfaces, run type checking and the existing unit suite for prompt/mock edits, and review rendered desktop/mobile screens for copy fit and clarity. Do not spend live provider credits or generate new episodes solely for this content change.
