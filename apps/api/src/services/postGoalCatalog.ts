export const postGoalCatalog = {
  "brand-awareness": "Introduce the brand with a memorable hook and clear identity. Prioritize recognition over selling.",
  "reach-visibility": "Use an accessible, shareable hook that reaches beyond existing followers. Avoid engagement bait.",
  "audience-growth": "Offer a clear reason to follow and an ongoing value proposition for new audiences.",
  "brand-positioning": "Communicate a distinctive perspective and differentiator supported by the brief.",
  "reputation-management": "Use calm, transparent language that addresses concerns responsibly. Never invent resolutions.",
  "engagement": "Invite meaningful conversation with a specific, easy-to-answer question. Avoid empty engagement bait.",
  "community-building": "Build belonging through inclusive language and shared interests. Invite community participation.",
  "entertainment": "Create light, enjoyable content with an original playful hook appropriate to the brand.",
  "storytelling": "Use a clear beginning, turning point, and takeaway. Do not invent real customer experiences.",
  "customer-feedback": "Ask a neutral, specific feedback question. Encourage honest experiences without steering responses.",
  "education-information": "Explain one useful concept clearly with practical steps and an actionable takeaway.",
  "trust-credibility": "Demonstrate expertise through clear reasoning and transparency. Avoid unsupported credentials or claims.",
  "social-proof": "Highlight only testimonials, experiences, or results supplied in the brief. Never fabricate proof.",
  "promotion": "Spotlight the supplied offering and its benefits. Only mention discounts or deadlines supplied in the brief.",
  "lead-generation": "Offer a clear value exchange and low-friction next step to express interest. Do not invent lead magnets.",
  "sales-conversion": "Connect supplied benefits to a concrete buying or booking action. Avoid false urgency and guarantees.",
  "traffic-generation": "Create curiosity with a truthful preview of the destination and a clear reason to click. Never invent URLs.",
  "event-awareness": "Highlight the supplied event purpose, logistics, and attendance action. Never invent dates or venues.",
  "customer-retention": "Help current customers get more value through useful tips, care, and appreciation.",
  "advocacy-referrals": "Invite voluntary recommendations or referrals. Never invent incentives or imply endorsements."
} as const;
export type PostGoal = keyof typeof postGoalCatalog;
