# X Account Analytics

Use this reference for own-account outcome learning when authenticated X Account Analytics is available. Treat these pages as read-only measurement surfaces, not as permission to automate X mutations.

## Surfaces

Prefer the authenticated account analytics routes:

- Content Posts, 7 days: `https://x.com/i/account_analytics/content?type=posts&sort=date&dir=desc&days=7`
- Content Replies, 7 days: `https://x.com/i/account_analytics/content?type=replies&sort=date&dir=desc&days=7`
- Content All, 7 days: `https://x.com/i/account_analytics/content?type=all&sort=date&dir=desc&days=7`
- Audience: `https://x.com/i/account_analytics/audience`

Use `agent-browser` with the authenticated resource-local X session for observation. Do not use browser scripting as an X posting/reply automation path.

## Content outcomes

The Content list separates Posts, Replies, and All. The table exposes Date, Impressions, Likes, Replies, and Reposts, with 7D/2W/4W/3M windows and per-output drilldowns. Treat Replies as first-class distribution outcomes rather than measuring only main-feed posts.

A per-output detail page may expose:

- Impressions
- Likes
- Replies
- Reposts
- Engagement rate
- Profile visits
- New follows
- Bookmarks
- Shares
- Media views

Its Activity Breakdown selector may expose Impressions, Likes, Replies, Reposts, Bookmark, Share, Profile Visits, and Follows over recent time windows. Use these time-series views when they materially help compare acceleration or decay.

Preserve unknowns. A missing field, `-`, `Not enough data yet`, or `Please check back again later` is unknown/null, never zero.

## Audience outcomes

The Audience selector may expose Likes, Impressions, Bookmarks, Shares, New follows, Replies, Reposts, and Profile visits. Available windows include 7D, 28D, and 3M. Audience panels may include Age, Active times, Following, Gender, Country, and Device.

Use audience views to understand who responds to each outcome type and when the audience is active. Do not treat a selected metric, demographic, device, or active-time heatmap as an X ranking factor. If a heatmap is visible without numeric cell values, use it only qualitatively; never invent cell counts.

## Growth OS handoff

When Growth OS is available, keep X Analytics as a measurement source and Growth OS as the state owner:

1. If Analytics reveals an exact owned output ID that Growth OS has not reconciled, record the exact live output before any retry.
2. Persist explicitly observed Content rows through `analytics-record` with `kind=content`, the correct `contentType`, and the visible Impressions/Likes/Replies/Reposts. These four list metrics must be present; do not synthesize missing values.
3. For important experiment posts, high-momentum outputs, and relationship replies, add detail metrics when observed: `bookmarks`, `shares`, `profileVisits`, `newFollows`, `engagementRatePct`, and `mediaViews`.
4. Persist Audience observations through `analytics-record` with `kind=audience`, the selected metric, window, and only the structured data actually visible.
5. Read the latest richer observations through `analytics`. Exact output IDs join them back to Growth OS candidate actions.

Do not drill every old output merely because data exists. Prefer active experiments, recent high-leverage Posts/Replies, surprising outliers, and outputs needed to resolve a growth decision.

Example content record payload shape:

```json
{
  "confirmRecord": true,
  "kind": "content",
  "contentType": "replies",
  "posts": [
    {
      "tweetId": "123",
      "text": "...",
      "impressions": 293,
      "likes": 0,
      "replies": 0,
      "reposts": 0,
      "profileVisits": 0,
      "newFollows": 0,
      "bookmarks": 0,
      "shares": 0,
      "engagementRatePct": 0.7
    }
  ]
}
```

## Learning interpretation

Keep the outcome funnel explicit:

`impressions -> engagement -> profile visits -> new follows -> qualified follower/relationship outcome`

A post can win reach and lose conversion, or have modest reach and strong profile/follow conversion. Compare outputs at similar post ages/windows where possible. Preserve topic, source momentum, reply crowding, timing, media, relationship context, and hashtag treatment as confounders.

Use an observed result to create a candidate lesson, not a platform law. The metric selector is an analysis lens; it does not prove what X ranks.
