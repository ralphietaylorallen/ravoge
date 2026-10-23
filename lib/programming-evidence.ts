// Versioned, locally cached source summaries. No paid/live web lookup happens
// during generation. Refresh requires a reviewed source-cache revision, not
// trusting arbitrary web prose or silently declaring stale evidence current.
export const PROGRAMMING_EVIDENCE = {
  version:"curated-2026-10-22", reviewedAt:"2026-10-22", reviewAfter:"2027-01-20",
  liveWebResearch:false,
  principles:["Adapt progressive resistance training to goals, experience and recovery; never infer injury clearance.",
    "Manage session and weekly volume, allow recovery, and progress from recorded successful work rather than assumed capacity.",
    "Healthy-adult population guidance is not an individual diagnosis or a guarantee of fat loss from a workout."],
  sources:[{title:"ACSM 2026 resistance-training position stand: overview of reviews",url:"https://pubmed.ncbi.nlm.nih.gov/41843416/"},
    {title:"US Physical Activity Guidelines",url:"https://odphp.health.gov/our-work/nutrition-physical-activity/physical-activity-guidelines/about-physical-activity-guidelines/questions-answers"}],
} as const;
export function programmingEvidence() { return {...PROGRAMMING_EVIDENCE,reviewDue:Date.now()>Date.parse(PROGRAMMING_EVIDENCE.reviewAfter)}; }
