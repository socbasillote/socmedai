export const postGoals = [
  {
    "id": "brand-awareness",
    "name": "Brand Awareness",
    "group": "Grow your reach",
    "description": "Introduce your brand and make it memorable."
  },
  {
    "id": "reach-visibility",
    "name": "Reach & Visibility",
    "group": "Grow your reach",
    "description": "Create content people want to discover and share."
  },
  {
    "id": "audience-growth",
    "name": "Audience Growth",
    "group": "Grow your reach",
    "description": "Give new followers a reason to stay."
  },
  {
    "id": "brand-positioning",
    "name": "Brand Positioning",
    "group": "Grow your reach",
    "description": "Show what makes your brand different."
  },
  {
    "id": "reputation-management",
    "name": "Reputation Management",
    "group": "Grow your reach",
    "description": "Strengthen a positive, responsible brand image."
  },
  {
    "id": "engagement",
    "name": "Engagement",
    "group": "Connect and engage",
    "description": "Start conversations and invite meaningful replies."
  },
  {
    "id": "community-building",
    "name": "Community Building",
    "group": "Connect and engage",
    "description": "Help your audience feel connected and included."
  },
  {
    "id": "entertainment",
    "name": "Entertainment",
    "group": "Connect and engage",
    "description": "Delight your audience with something enjoyable."
  },
  {
    "id": "storytelling",
    "name": "Storytelling",
    "group": "Connect and engage",
    "description": "Bring your message to life through a story."
  },
  {
    "id": "customer-feedback",
    "name": "Customer Feedback",
    "group": "Connect and engage",
    "description": "Learn what your customers think and need."
  },
  {
    "id": "education-information",
    "name": "Education & Information",
    "group": "Inform and build trust",
    "description": "Teach something useful and easy to understand."
  },
  {
    "id": "trust-credibility",
    "name": "Trust & Credibility",
    "group": "Inform and build trust",
    "description": "Show your expertise with honest, helpful content."
  },
  {
    "id": "social-proof",
    "name": "Social Proof",
    "group": "Inform and build trust",
    "description": "Highlight real experiences and customer results."
  },
  {
    "id": "promotion",
    "name": "Promotion",
    "group": "Drive sales and action",
    "description": "Put a product, service, or offer in the spotlight."
  },
  {
    "id": "lead-generation",
    "name": "Lead Generation",
    "group": "Drive sales and action",
    "description": "Encourage interested people to take the next step."
  },
  {
    "id": "sales-conversion",
    "name": "Sales & Conversion",
    "group": "Drive sales and action",
    "description": "Help people feel ready to buy or book."
  },
  {
    "id": "traffic-generation",
    "name": "Traffic Generation",
    "group": "Drive sales and action",
    "description": "Give people a reason to visit your link."
  },
  {
    "id": "event-awareness",
    "name": "Event Awareness",
    "group": "Drive sales and action",
    "description": "Help people discover and attend your event."
  },
  {
    "id": "customer-retention",
    "name": "Customer Retention",
    "group": "Keep customers",
    "description": "Keep existing customers informed and valued."
  },
  {
    "id": "advocacy-referrals",
    "name": "Advocacy & Referrals",
    "group": "Keep customers",
    "description": "Invite happy customers to spread the word."
  }
] as const;
export type PostGoal = typeof postGoals[number]["id"];
