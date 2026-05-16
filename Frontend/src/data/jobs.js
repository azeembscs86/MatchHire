export const jobs = [
  { co: 'Linear', l: 'L', cl: 'lg-1', title: 'Staff Frontend Engineer', loc: 'Remote · Worldwide', type: 'Full-time', pay: '$180–230K', tags: ['React', 'TypeScript', 'Next.js'], time: '2h ago', match: '96% match', featured: true },
  { co: 'Stripe', l: 'S', cl: 'lg-2', title: 'Senior Backend Architect', loc: 'San Francisco · Hybrid', type: 'Full-time', pay: '$210–280K', tags: ['Node.js', 'Go', 'AWS'], time: '1d ago', match: '92% match' },
  { co: 'Figma', l: 'F', cl: 'lg-3', title: 'Product Designer III', loc: 'New York · Onsite', type: 'Full-time', pay: '$160–195K', tags: ['Figma', 'UX Research'], time: '5h ago', match: '88% match' },
  { co: 'Vercel', l: 'V', cl: 'lg-7', title: 'Developer Experience Lead', loc: 'Remote · US/EU', type: 'Full-time', pay: '$170–210K', tags: ['React', 'DX', 'Open source'], time: '9h ago', match: '94% match', featured: true },
  { co: 'Anthropic', l: 'A', cl: 'lg-4', title: 'Senior ML Engineer', loc: 'San Francisco · Hybrid', type: 'Full-time', pay: '$240–320K', tags: ['Python', 'PyTorch', 'LLMs'], time: '12h ago', match: '78% match' },
  { co: 'Notion', l: 'N', cl: 'lg-5', title: 'Senior Full-Stack Engineer', loc: 'Remote · Americas', type: 'Full-time', pay: '$165–205K', tags: ['TypeScript', 'React', 'Node.js'], time: '3d ago', match: '93% match' },
  { co: 'Ramp', l: 'R', cl: 'lg-6', title: 'Engineering Manager · Platform', loc: 'New York · Hybrid', type: 'Full-time', pay: '$230–290K', tags: ['Leadership', 'Backend', 'Fintech'], time: '4d ago', match: '82% match' },
  { co: 'Brex', l: 'B', cl: 'lg-8', title: 'Senior Frontend Engineer', loc: 'Remote · Worldwide', type: 'Full-time', pay: '$170–220K', tags: ['React', 'TypeScript', 'GraphQL'], time: '2d ago', match: '91% match' },
  { co: 'Loom', l: 'L', cl: 'lg-1', title: 'Staff Designer', loc: 'San Francisco · Hybrid', type: 'Full-time', pay: '$190–235K', tags: ['Figma', 'Motion', 'Design Systems'], time: '1d ago', match: '85% match' },
  { co: 'Plaid', l: 'P', cl: 'lg-3', title: 'Security Engineer', loc: 'New York · Onsite', type: 'Full-time', pay: '$180–240K', tags: ['Security', 'Python', 'Cloud'], time: '2d ago', match: '70% match' },
  { co: 'Webflow', l: 'W', cl: 'lg-2', title: 'Senior Product Manager', loc: 'Remote · US', type: 'Full-time', pay: '$170–210K', tags: ['PM', 'SaaS', 'Growth'], time: '6h ago', match: '76% match' },
  { co: 'Retool', l: 'R', cl: 'lg-4', title: 'Solutions Engineer', loc: 'Remote · Worldwide', type: 'Full-time', pay: '$140–180K', tags: ['React', 'SQL', 'TS'], time: '8h ago', match: '89% match' },
];

export const jobCollections = {
  0: 'top', 1: 'top', 2: 'soon', 3: 'top',
  4: 'maybe', 5: 'soon', 6: 'maybe', 7: 'top',
  8: 'maybe', 9: 'soon', 10: 'maybe', 11: 'maybe'
};

export const collectionLabels = {
  top: { name: 'Top pick', cls: 'col-top', icon: '★' },
  soon: { name: 'Apply soon', cls: 'col-soon', icon: '⏰' },
  maybe: { name: 'Maybe later', cls: 'col-maybe', icon: '◐' },
  applied: { name: 'Applied', cls: 'col-applied', icon: '✓' },
};

export const deadlines = {
  2: 'Application closes in 3 days',
  5: 'Closes Friday · 4 days left',
  9: 'Recruiter actively reviewing'
};
