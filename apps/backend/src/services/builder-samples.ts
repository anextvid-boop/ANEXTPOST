export const ANEXTVID_SAMPLE_BATCH = 'anextvid-zip-starter-v1';

export const ANEXTVID_SAMPLE_COLLECTIONS = [
  {
    name: 'ANEXTVID Short-Form Visual',
    description: 'On-graphic headlines paired with concise LinkedIn captions.',
  },
  {
    name: 'ANEXTVID Discovery',
    description: 'Consultation-led posts explaining scope, process, and clarity.',
  },
  {
    name: 'Personal Stories',
    description: 'Founder-led stories, honest lessons, and personal reflections.',
  },
  {
    name: 'My Offer',
    description: 'Consultation-first positioning, fit calls, content audits, and next-step CTAs.',
  },
  {
    name: 'Services & Products',
    description: 'Photography, video, editing, and product showcase copy for client work.',
  },
  {
    name: 'Lead Magnets',
    description: 'Value-first checklists, guides, and comment-to-DM resource drops that earn saves and replies.',
  },
  {
    name: 'Website & Portfolio',
    description: 'Posts that route readers to your website, portfolio, or booking page without link-drop friction.',
  },
  {
    name: 'Product & SaaS',
    description: 'Problem-first product spotlights, workflow demos, and honest build-in-public updates.',
  },
  {
    name: 'Case Breakdowns',
    description: 'Structured project and decision breakdowns with concrete proof and takeaways.',
  },
  {
    name: 'Myth & Nuance',
    description: 'Grounded perspective posts that challenge common industry assumptions with practical nuance.',
  },
  {
    name: 'Behind the Work',
    description: 'Studio process notes, shoot prep, and behind-the-scenes decisions in ANEXTVID short-form style.',
  },
  {
    name: 'Founder-Led Video & Brand',
    description: 'Turning founder expertise, calls, and everyday decisions into clear video and personal brand posts.',
  },
  {
    name: 'Writing & Content Craft',
    description: 'Practical notes on drafting, voice-note outlining, editing down to one example, and starting conversations.',
  },
  {
    name: 'Buyer Questions & Objections',
    description: 'Calm, direct answers to pre-project questions around scope, prep, format choice, and fit.',
  },
];

export const ANEXTVID_SAMPLE_POST_TYPES = [
  {
    name: 'Short Visual Post',
    description: 'Separate on-graphic headline plus 35–90 word caption.',
  },
  {
    name: 'Discovery & Approach',
    description: 'Hook, context, ANEXTVID approach, CTA, and hashtags.',
  },
  {
    name: 'Personal Story',
    description: 'Narrative hook, grounded story detail, reflection question, and sign-off.',
  },
  {
    name: 'Offer & Consultation',
    description: 'Problem framing, consultation offer, and low-friction invitation.',
  },
  {
    name: 'Service & Product Showcase',
    description: 'Visual craftsmanship angle for photography, video, and product shoots.',
  },
  {
    name: 'Lead Magnet & Resource Drop',
    description: 'Teach the core idea first, then offer a checklist, template, or guide via comment keyword.',
  },
  {
    name: 'Website & Portfolio Traffic',
    description: 'Qualify the reader and bridge cleanly to your website, portfolio, or booking page.',
  },
  {
    name: 'Product & Feature Spotlight',
    description: 'Lead with the workflow friction, show what changed, and invite readers to try it.',
  },
  {
    name: 'Case Breakdown',
    description: 'Walk through the starting situation, what was done, observed outcome, and takeaway.',
  },
  {
    name: 'Myth & Nuance',
    description: 'State a common assumption, explain where it breaks down, and offer a grounded rule.',
  },
  {
    name: 'Behind-the-Scenes Process',
    description: 'On-image headline, concise studio observation, open question, and ANEXTVID sign-off.',
  },
  {
    name: 'Founder Video & Positioning',
    description: 'Show how founder decisions and customer questions become clear visual content.',
  },
  {
    name: 'Content Workflow & Notes',
    description: 'Short, practical notes on writing, editing, and organising ideas.',
  },
  {
    name: 'Buyer FAQ & Scope',
    description: 'Answer a real pre-project question clearly to clarify scope and fit.',
  },
];

export const ANEXTVID_SAMPLE_FORMULAS = [
  {
    name: 'Short-Form Visual (ANEXTVID)',
    length: 'short',
    collectionName: 'ANEXTVID Short-Form Visual',
    postTypeName: 'Short Visual Post',
    sections: [
      {
        id: 'anx-sf-1',
        role: 'graphic_note',
        label: 'On-Graphic Headline (Not in caption)',
        optional: true,
        includeInCaption: false,
      },
      {
        id: 'anx-sf-2',
        role: 'hook',
        label: 'Supporting Opening',
        optional: true,
        includeInCaption: true,
      },
      {
        id: 'anx-sf-3',
        role: 'body',
        label: 'Core Message',
        optional: false,
        includeInCaption: true,
      },
      {
        id: 'anx-sf-4',
        role: 'question',
        label: 'Closing Question',
        optional: true,
        includeInCaption: true,
      },
      {
        id: 'anx-sf-5',
        role: 'signoff',
        label: 'Sign-off',
        optional: true,
        includeInCaption: true,
      },
      {
        id: 'anx-sf-6',
        role: 'hashtags',
        label: 'Hashtags',
        optional: true,
        includeInCaption: true,
      },
    ],
  },
  {
    name: 'Discovery Post (ANEXTVID)',
    length: 'standard',
    collectionName: 'ANEXTVID Discovery',
    postTypeName: 'Discovery & Approach',
    sections: [
      {
        id: 'anx-dc-1',
        role: 'hook',
        label: 'Hook / Opening',
        optional: false,
        includeInCaption: true,
      },
      {
        id: 'anx-dc-2',
        role: 'context',
        label: 'Context / Setup',
        optional: false,
        includeInCaption: true,
      },
      {
        id: 'anx-dc-3',
        role: 'body',
        label: 'ANEXTVID Approach',
        optional: false,
        includeInCaption: true,
      },
      {
        id: 'anx-dc-4',
        role: 'question',
        label: 'CTA / Next Step',
        optional: true,
        includeInCaption: true,
      },
      {
        id: 'anx-dc-5',
        role: 'signoff',
        label: 'Sign-off',
        optional: true,
        includeInCaption: true,
      },
      {
        id: 'anx-dc-6',
        role: 'hashtags',
        label: 'Hashtags',
        optional: true,
        includeInCaption: true,
      },
    ],
  },
  {
    name: 'Lead Magnet Drop (ANEXTVID)',
    length: 'standard',
    collectionName: 'Lead Magnets',
    postTypeName: 'Lead Magnet & Resource Drop',
    sections: [
      {
        id: 'anx-lm-0',
        role: 'graphic_note',
        label: 'On-Graphic Headline (Not in caption)',
        optional: true,
        includeInCaption: false,
      },
      {
        id: 'anx-lm-1',
        role: 'hook',
        label: 'Hook / Opening',
        optional: false,
        includeInCaption: true,
      },
      {
        id: 'anx-lm-2',
        role: 'context',
        label: 'Why This Matters',
        optional: true,
        includeInCaption: true,
      },
      {
        id: 'anx-lm-3',
        role: 'body',
        label: 'Core Framework / What Is Inside',
        optional: false,
        includeInCaption: true,
      },
      {
        id: 'anx-lm-4',
        role: 'takeaway',
        label: 'Who It Helps',
        optional: true,
        includeInCaption: true,
      },
      {
        id: 'anx-lm-5',
        role: 'question',
        label: 'Comment Keyword CTA',
        optional: false,
        includeInCaption: true,
      },
      {
        id: 'anx-lm-6',
        role: 'signoff',
        label: 'Sign-off',
        optional: true,
        includeInCaption: true,
      },
      {
        id: 'anx-lm-7',
        role: 'hashtags',
        label: 'Hashtags',
        optional: true,
        includeInCaption: true,
      },
    ],
  },
  {
    name: 'Website / Portfolio Bridge (ANEXTVID)',
    length: 'standard',
    collectionName: 'Website & Portfolio',
    postTypeName: 'Website & Portfolio Traffic',
    sections: [
      {
        id: 'anx-wb-1',
        role: 'hook',
        label: 'Hook / Buyer Question',
        optional: false,
        includeInCaption: true,
      },
      {
        id: 'anx-wb-2',
        role: 'context',
        label: 'What People Usually Miss',
        optional: true,
        includeInCaption: true,
      },
      {
        id: 'anx-wb-3',
        role: 'body',
        label: 'What You Will Find on the Site',
        optional: false,
        includeInCaption: true,
      },
      {
        id: 'anx-wb-4',
        role: 'question',
        label: 'Link / Next-Step CTA',
        optional: false,
        includeInCaption: true,
      },
      {
        id: 'anx-wb-5',
        role: 'signoff',
        label: 'Sign-off',
        optional: true,
        includeInCaption: true,
      },
      {
        id: 'anx-wb-6',
        role: 'hashtags',
        label: 'Hashtags',
        optional: true,
        includeInCaption: true,
      },
    ],
  },
  {
    name: 'Product / Feature Spotlight (ANEXTVID)',
    length: 'standard',
    collectionName: 'Product & SaaS',
    postTypeName: 'Product & Feature Spotlight',
    sections: [
      {
        id: 'anx-pr-0',
        role: 'graphic_note',
        label: 'On-Graphic Headline (Not in caption)',
        optional: true,
        includeInCaption: false,
      },
      {
        id: 'anx-pr-1',
        role: 'hook',
        label: 'Workflow Friction Hook',
        optional: false,
        includeInCaption: true,
      },
      {
        id: 'anx-pr-2',
        role: 'context',
        label: 'Old Way vs New Way',
        optional: true,
        includeInCaption: true,
      },
      {
        id: 'anx-pr-3',
        role: 'body',
        label: 'How the Product Solves It',
        optional: false,
        includeInCaption: true,
      },
      {
        id: 'anx-pr-4',
        role: 'proof',
        label: 'Grounded Proof / Build Detail',
        optional: true,
        includeInCaption: true,
      },
      {
        id: 'anx-pr-5',
        role: 'question',
        label: 'Try / Feedback CTA',
        optional: true,
        includeInCaption: true,
      },
      {
        id: 'anx-pr-6',
        role: 'signoff',
        label: 'Sign-off',
        optional: true,
        includeInCaption: true,
      },
      {
        id: 'anx-pr-7',
        role: 'hashtags',
        label: 'Hashtags',
        optional: true,
        includeInCaption: true,
      },
    ],
  },
  {
    name: 'Behind the Work (ANEXTVID)',
    length: 'short',
    collectionName: 'Behind the Work',
    postTypeName: 'Behind-the-Scenes Process',
    sections: [
      {
        id: 'anx-btw-1',
        role: 'graphic_note',
        label: 'On-Graphic Headline (Not in caption)',
        optional: true,
        includeInCaption: false,
      },
      {
        id: 'anx-btw-2',
        role: 'hook',
        label: 'Opening Line',
        optional: false,
        includeInCaption: true,
      },
      {
        id: 'anx-btw-3',
        role: 'body',
        label: 'Process Detail',
        optional: false,
        includeInCaption: true,
      },
      {
        id: 'anx-btw-4',
        role: 'question',
        label: 'Closing Question',
        optional: true,
        includeInCaption: true,
      },
      {
        id: 'anx-btw-5',
        role: 'signoff',
        label: 'Sign-off',
        optional: true,
        includeInCaption: true,
      },
      {
        id: 'anx-btw-6',
        role: 'hashtags',
        label: 'Hashtags',
        optional: true,
        includeInCaption: true,
      },
    ],
  },
  {
    name: 'Founder Video & Brand (ANEXTVID)',
    length: 'short',
    collectionName: 'Founder-Led Video & Brand',
    postTypeName: 'Founder Video & Positioning',
    sections: [
      {
        id: 'anx-fvb-1',
        role: 'graphic_note',
        label: 'On-Graphic Headline (Not in caption)',
        optional: true,
        includeInCaption: false,
      },
      {
        id: 'anx-fvb-2',
        role: 'hook',
        label: 'Opening Principle',
        optional: false,
        includeInCaption: true,
      },
      {
        id: 'anx-fvb-3',
        role: 'body',
        label: 'Practical Application',
        optional: false,
        includeInCaption: true,
      },
      {
        id: 'anx-fvb-4',
        role: 'question',
        label: 'Closing Question',
        optional: true,
        includeInCaption: true,
      },
      {
        id: 'anx-fvb-5',
        role: 'signoff',
        label: 'Sign-off',
        optional: true,
        includeInCaption: true,
      },
      {
        id: 'anx-fvb-6',
        role: 'hashtags',
        label: 'Hashtags',
        optional: true,
        includeInCaption: true,
      },
    ],
  },
  {
    name: 'Buyer FAQ & Fit (ANEXTVID)',
    length: 'standard',
    collectionName: 'Buyer Questions & Objections',
    postTypeName: 'Buyer FAQ & Scope',
    sections: [
      {
        id: 'anx-faq-1',
        role: 'hook',
        label: 'Buyer Question / Opening',
        optional: false,
        includeInCaption: true,
      },
      {
        id: 'anx-faq-2',
        role: 'context',
        label: 'Why People Ask This',
        optional: true,
        includeInCaption: true,
      },
      {
        id: 'anx-faq-3',
        role: 'body',
        label: 'Direct Answer & Scope',
        optional: false,
        includeInCaption: true,
      },
      {
        id: 'anx-faq-4',
        role: 'takeaway',
        label: 'Practical Next Step',
        optional: true,
        includeInCaption: true,
      },
      {
        id: 'anx-faq-5',
        role: 'question',
        label: 'Closing Question / CTA',
        optional: true,
        includeInCaption: true,
      },
      {
        id: 'anx-faq-6',
        role: 'signoff',
        label: 'Sign-off',
        optional: true,
        includeInCaption: true,
      },
      {
        id: 'anx-faq-7',
        role: 'hashtags',
        label: 'Hashtags',
        optional: true,
        includeInCaption: true,
      },
    ],
  },
];

export const ANEXTVID_SAMPLE_VARIATIONS = [
  // On-Graphic Headlines (excluded from LinkedIn caption)
  {
    sectionRole: 'graphic_note',
    title: 'How important is your business to you?',
    content: 'How important is your business to you?',
    collectionName: 'ANEXTVID Short-Form Visual',
    postTypeName: 'Short Visual Post',
    lengthHint: 'short',
  },
  {
    sectionRole: 'graphic_note',
    title: 'Are you proud of how your business looks online?',
    content: 'Are you proud of how your business looks online?',
    collectionName: 'ANEXTVID Short-Form Visual',
    postTypeName: 'Short Visual Post',
    lengthHint: 'short',
  },
  {
    sectionRole: 'graphic_note',
    title: "What's stopping your business from growing?",
    content: "What's stopping your business from growing?",
    collectionName: 'ANEXTVID Short-Form Visual',
    postTypeName: 'Short Visual Post',
    lengthHint: 'short',
  },

  // Hooks / Openings
  {
    sectionRole: 'hook',
    title: 'Strong first impression',
    content:
      'A strong first impression should tell people what they need to know.',
    collectionName: 'ANEXTVID Short-Form Visual',
    postTypeName: 'Short Visual Post',
    lengthHint: 'short',
  },
  {
    sectionRole: 'hook',
    title: 'You know your work inside out',
    content: "You know your work inside out. New customers don't.",
    collectionName: 'ANEXTVID Short-Form Visual',
    postTypeName: 'Short Visual Post',
    lengthHint: 'short',
  },
  {
    sectionRole: 'hook',
    title: 'How much content does your business need?',
    content: 'How much content does your business actually need?',
    collectionName: 'ANEXTVID Discovery',
    postTypeName: 'Discovery & Approach',
    lengthHint: 'standard',
  },
  {
    sectionRole: 'hook',
    title: 'Ready to invest in visual presence?',
    content: "Ready to invest in your business's visual presence?",
    collectionName: 'ANEXTVID Discovery',
    postTypeName: 'Discovery & Approach',
    lengthHint: 'standard',
  },

  // Context
  {
    sectionRole: 'context',
    title: 'Content requirements & scope',
    content:
      'One professional video? A new collection of photographs? Or enough content to support your business every week? The right answer depends on your goals, your audience and how regularly you need to communicate.',
    collectionName: 'ANEXTVID Discovery',
    postTypeName: 'Discovery & Approach',
    lengthHint: 'standard',
  },
  {
    sectionRole: 'context',
    title: 'Investment readiness',
    content:
      "Professional photography and video can help communicate what your business offers, who it's for and why customers should pay attention. But the right investment depends on what you're trying to achieve and the scale of production involved.",
    collectionName: 'ANEXTVID Discovery',
    postTypeName: 'Discovery & Approach',
    lengthHint: 'standard',
  },

  // Core Bodies
  {
    sectionRole: 'body',
    title: 'Three details for a clear intro',
    content:
      'Show what you do, who you help and what happens next. Those three details can make an introduction far more useful.',
    collectionName: 'ANEXTVID Short-Form Visual',
    postTypeName: 'Short Visual Post',
    lengthHint: 'short',
  },
  {
    sectionRole: 'body',
    title: 'Plain words over jargon',
    content:
      "People should know what you're offering without having to decode industry language. Plain words can do a lot of work.",
    collectionName: 'ANEXTVID Short-Form Visual',
    postTypeName: 'Short Visual Post',
    lengthHint: 'short',
  },
  {
    sectionRole: 'body',
    title: 'Short consultation before scope',
    content:
      'At ANEXTVID, we start with a short consultation to understand your requirements before recommending photography, video or ongoing content production. We want the scope to make sense for your business and your investment.',
    collectionName: 'ANEXTVID Discovery',
    postTypeName: 'Discovery & Approach',
    lengthHint: 'standard',
  },
  {
    sectionRole: 'body',
    title: 'Objectives, budget and timeframe first',
    content:
      'At ANEXTVID, we discuss your objectives, budget and timeframe before developing a tailored proposal. Whether you need a focused project or ongoing creative support, the process begins with understanding your priorities.',
    collectionName: 'ANEXTVID Discovery',
    postTypeName: 'Discovery & Approach',
    lengthHint: 'standard',
  },

  // Questions / CTAs
  {
    sectionRole: 'question',
    title: 'Five-second clarity question',
    content:
      'What should someone understand about your business in five seconds?',
    collectionName: 'ANEXTVID Short-Form Visual',
    postTypeName: 'Short Visual Post',
    lengthHint: 'short',
  },
  {
    sectionRole: 'question',
    title: 'Common pre-contact question',
    content: 'What do people most often ask before they contact you?',
    collectionName: 'ANEXTVID Short-Form Visual',
    postTypeName: 'Short Visual Post',
    lengthHint: 'short',
  },
  {
    sectionRole: 'question',
    title: 'Explore what you actually need',
    content:
      "If you're considering professional content, let's explore what you actually need.",
    collectionName: 'ANEXTVID Discovery',
    postTypeName: 'Discovery & Approach',
    lengthHint: 'standard',
  },
  {
    sectionRole: 'question',
    title: 'Five-minute conversation CTA',
    content:
      "Already planning a project? Let's have a five-minute conversation.",
    collectionName: 'ANEXTVID Discovery',
    postTypeName: 'Discovery & Approach',
    lengthHint: 'standard',
  },

  // Sign-offs
  {
    sectionRole: 'signoff',
    title: 'ANEXTVID.',
    content: 'ANEXTVID.',
    collectionName: 'ANEXTVID Short-Form Visual',
    postTypeName: 'Short Visual Post',
    lengthHint: null,
  },
  {
    sectionRole: 'signoff',
    title: 'Jahronimo — ANEXTVID.',
    content: 'Jahronimo — ANEXTVID.',
    collectionName: 'ANEXTVID Short-Form Visual',
    postTypeName: 'Short Visual Post',
    lengthHint: null,
  },
  {
    sectionRole: 'signoff',
    title: 'ANEXTVID — creative work with purpose.',
    content: 'ANEXTVID — creative work with purpose.',
    collectionName: 'ANEXTVID Discovery',
    postTypeName: 'Discovery & Approach',
    lengthHint: null,
  },

  // Hashtags
  {
    sectionRole: 'hashtags',
    title: 'Video production tags',
    content: '#VideoProduction #BusinessVideo #BrandVideo',
    collectionName: 'ANEXTVID Short-Form Visual',
    postTypeName: 'Short Visual Post',
    lengthHint: 'short',
  },
  {
    sectionRole: 'hashtags',
    title: 'Content production tags',
    content: '#ANEXTVID #ContentProduction #BusinessMarketing',
    collectionName: 'ANEXTVID Discovery',
    postTypeName: 'Discovery & Approach',
    lengthHint: 'standard',
  },
  {
    sectionRole: 'hashtags',
    title: 'Creative branding tags',
    content: '#ANEXTVID #CreativeProduction #BusinessBranding',
    collectionName: 'ANEXTVID Discovery',
    postTypeName: 'Discovery & Approach',
    lengthHint: 'standard',
  },

  // Personal Stories
  {
    sectionRole: 'hook',
    title: 'Swamp rescue opener',
    content: 'I still remember swamp rescue.',
    collectionName: 'Personal Stories',
    postTypeName: 'Personal Story',
    lengthHint: 'short',
  },
  {
    sectionRole: 'hook',
    title: 'Unexpected chapter',
    content: 'One of the most unexpected chapters of my life involves swamp rescue.',
    collectionName: 'Personal Stories',
    postTypeName: 'Personal Story',
    lengthHint: 'short',
  },
  {
    sectionRole: 'body',
    title: 'Unfolded in real time',
    content:
      'At the time, I was dealing with the situation as it unfolded. I can describe what happened without pretending I had a perfect plan.',
    collectionName: 'Personal Stories',
    postTypeName: 'Personal Story',
    lengthHint: 'standard',
  },
  {
    sectionRole: 'body',
    title: 'Real, messy and specific',
    content:
      'The experience was real, messy and specific. I would rather tell it plainly than make it sound bigger than it was.',
    collectionName: 'Personal Stories',
    postTypeName: 'Personal Story',
    lengthHint: 'standard',
  },
  {
    sectionRole: 'question',
    title: 'Unexpected lesson prompt',
    content:
      'What’s an unexpected moment from your own work that taught you something lasting?',
    collectionName: 'Personal Stories',
    postTypeName: 'Personal Story',
    lengthHint: null,
  },
  {
    sectionRole: 'signoff',
    title: 'Personal story sign-off',
    content: 'Jahronimo — ANEXTVID.',
    collectionName: 'Personal Stories',
    postTypeName: 'Personal Story',
    lengthHint: null,
  },

  // My Offer
  {
    sectionRole: 'hook',
    title: 'Scope before production',
    content:
      'Good creative work starts with understanding what your business actually needs.',
    collectionName: 'My Offer',
    postTypeName: 'Offer & Consultation',
    lengthHint: 'short',
  },
  {
    sectionRole: 'body',
    title: 'Short consultation first',
    content:
      'At ANEXTVID, we start with a short consultation to understand your requirements before recommending photography, video or ongoing content production. We want the scope to make sense for your business and your investment.',
    collectionName: 'My Offer',
    postTypeName: 'Offer & Consultation',
    lengthHint: 'standard',
  },
  {
    sectionRole: 'body',
    title: 'Five-minute fit call',
    content:
      'At ANEXTVID, we begin with a short fit call. If there’s a suitable opportunity, we can then research your existing content, explore your requirements and discuss a realistic budget before proposing the next steps.',
    collectionName: 'My Offer',
    postTypeName: 'Offer & Consultation',
    lengthHint: 'standard',
  },
  {
    sectionRole: 'question',
    title: 'Ideal customer prompt',
    content: 'If you could attract more of one type of customer, who would it be?',
    collectionName: 'My Offer',
    postTypeName: 'Offer & Consultation',
    lengthHint: null,
  },
  {
    sectionRole: 'signoff',
    title: 'Five-minute conversation CTA',
    content: 'Already planning a project? Let’s have a five-minute conversation.',
    collectionName: 'My Offer',
    postTypeName: 'Offer & Consultation',
    lengthHint: null,
  },
  {
    sectionRole: 'hashtags',
    title: 'Offer & strategy tags',
    content: '#ANEXTVID #VideoStrategy #ContentProduction',
    collectionName: 'My Offer',
    postTypeName: 'Offer & Consultation',
    lengthHint: 'short',
  },

  // Services & Products
  {
    sectionRole: 'hook',
    title: 'Visual presentation matters',
    content:
      'How a product or service is shown shapes how seriously people take it.',
    collectionName: 'Services & Products',
    postTypeName: 'Service & Product Showcase',
    lengthHint: 'short',
  },
  {
    sectionRole: 'body',
    title: 'Product character & detail',
    content:
      'For a product, the way it is photographed can draw attention to its character and detail.',
    collectionName: 'Services & Products',
    postTypeName: 'Service & Product Showcase',
    lengthHint: 'short',
  },
  {
    sectionRole: 'body',
    title: 'Considered first impression',
    content:
      'For a business, that attention to framing, light and perspective can help make the first impression more considered.',
    collectionName: 'Services & Products',
    postTypeName: 'Service & Product Showcase',
    lengthHint: 'short',
  },
  {
    sectionRole: 'body',
    title: 'Coherent brand presentation',
    content:
      'For a brand, consistency across images and footage can make its presentation feel more coherent.',
    collectionName: 'Services & Products',
    postTypeName: 'Service & Product Showcase',
    lengthHint: 'short',
  },
  {
    sectionRole: 'question',
    title: 'Visual refresh prompt',
    content:
      'Which part of your product or service presentation deserves a sharper visual refresh next?',
    collectionName: 'Services & Products',
    postTypeName: 'Service & Product Showcase',
    lengthHint: null,
  },
  {
    sectionRole: 'signoff',
    title: 'Services sign-off',
    content: 'ANEXTVID — photography, video & visual production.',
    collectionName: 'Services & Products',
    postTypeName: 'Service & Product Showcase',
    lengthHint: null,
  },
  {
    sectionRole: 'hashtags',
    title: 'Services & products tags',
    content: '#ProductPhotography #BrandVideo #ANEXTVID',
    collectionName: 'Services & Products',
    postTypeName: 'Service & Product Showcase',
    lengthHint: 'short',
  },

  // ============================================================================
  // Lead Magnets (Comment-to-DM / Resource Drops / Checklists)
  // ============================================================================
  {
    sectionRole: 'graphic_note',
    title: 'Free 1-Page Video Brief Checklist',
    content: 'The 1-page video brief checklist we use before every shoot.',
    collectionName: 'Lead Magnets',
    postTypeName: 'Lead Magnet & Resource Drop',
    lengthHint: 'short',
  },
  {
    sectionRole: 'graphic_note',
    title: '5-Minute Website Visual Audit',
    content: '5 questions to audit how your business looks online.',
    collectionName: 'Lead Magnets',
    postTypeName: 'Lead Magnet & Resource Drop',
    lengthHint: 'short',
  },
  {
    sectionRole: 'hook',
    title: 'Most shoots go wrong before the camera turns on',
    content: 'Most video shoots go wrong before a camera is even switched on.',
    collectionName: 'Lead Magnets',
    postTypeName: 'Lead Magnet & Resource Drop',
    lengthHint: 'short',
  },
  {
    sectionRole: 'hook',
    title: 'Before you book photography or video',
    content: "If you're planning a shoot this quarter, save yourself two weeks of back-and-forth.",
    collectionName: 'Lead Magnets',
    postTypeName: 'Lead Magnet & Resource Drop',
    lengthHint: 'short',
  },
  {
    sectionRole: 'hook',
    title: 'LinkedIn content system without guesswork',
    content: 'Posting consistently gets easier when you stop starting from a blank page.',
    collectionName: 'Lead Magnets',
    postTypeName: 'Lead Magnet & Resource Drop',
    lengthHint: 'short',
  },
  {
    sectionRole: 'context',
    title: 'Unclear briefs waste budget',
    content:
      'When the goal, audience, and where the footage will live are fuzzy, production takes longer and the final edit rarely lands the way it should.',
    collectionName: 'Lead Magnets',
    postTypeName: 'Lead Magnet & Resource Drop',
    lengthHint: 'standard',
  },
  {
    sectionRole: 'context',
    title: 'First-impression gap on websites',
    content:
      'A prospect usually decides whether to trust your business within seconds of landing on your homepage or LinkedIn profile. Outdated visuals make strong work look smaller than it is.',
    collectionName: 'Lead Magnets',
    postTypeName: 'Lead Magnet & Resource Drop',
    lengthHint: 'standard',
  },
  {
    sectionRole: 'body',
    title: '4-step pre-shoot brief checklist',
    content:
      'I put together the exact 1-page Pre-Shoot Brief Checklist we walk through with clients:\n\n1. The single message a new customer needs to understand in 5 seconds.\n2. Where the footage will actually be used (homepage, LinkedIn, ads, or sales DMs).\n3. The shots and proof you already have vs what needs filming.\n4. Realistic timeline, deliverables, and sign-off points.',
    collectionName: 'Lead Magnets',
    postTypeName: 'Lead Magnet & Resource Drop',
    lengthHint: 'standard',
  },
  {
    sectionRole: 'body',
    title: '5-point visual & content audit',
    content:
      'Here is the 5-point visual check I use when reviewing a business online:\n\n1. Can a stranger tell what you do in five seconds?\n2. Do your photos match the current quality of your work?\n3. Is there one clear next step on your main page?\n4. Are you showing real process and people, or generic stock?\n5. Does your LinkedIn banner and pinned post point to the same offer?',
    collectionName: 'Lead Magnets',
    postTypeName: 'Lead Magnet & Resource Drop',
    lengthHint: 'standard',
  },
  {
    sectionRole: 'body',
    title: 'Modular LinkedIn post template pack',
    content:
      'To keep writing simple, I organised our modular LinkedIn post structures into a clean reference sheet:\n\n• 5 hook patterns that earn the click without clickbait.\n• Short vs standard post formulas for visual and text-led posts.\n• Low-friction closing questions that invite real replies.',
    collectionName: 'Lead Magnets',
    postTypeName: 'Lead Magnet & Resource Drop',
    lengthHint: 'standard',
  },
  {
    sectionRole: 'takeaway',
    title: 'Clarity before production',
    content:
      'A clear 1-page plan does more for your budget than an extra day of filming.',
    collectionName: 'Lead Magnets',
    postTypeName: 'Lead Magnet & Resource Drop',
    lengthHint: 'short',
  },
  {
    sectionRole: 'question',
    title: 'Comment BRIEF keyword CTA',
    content:
      'Want a copy of the checklist? Comment "BRIEF" below and I\'ll send it over in your DMs.\n\n(Make sure we\'re connected or following so LinkedIn lets me message you.)',
    collectionName: 'Lead Magnets',
    postTypeName: 'Lead Magnet & Resource Drop',
    lengthHint: 'standard',
  },
  {
    sectionRole: 'question',
    title: 'Comment AUDIT keyword CTA',
    content:
      'If you\'d like the 5-point audit sheet, drop "AUDIT" in the comments and I\'ll send it across.',
    collectionName: 'Lead Magnets',
    postTypeName: 'Lead Magnet & Resource Drop',
    lengthHint: 'short',
  },
  {
    sectionRole: 'question',
    title: 'Comment TEMPLATE keyword CTA',
    content:
      'Comment "TEMPLATE" below and I\'ll DM you the modular post sheet — no email gate.',
    collectionName: 'Lead Magnets',
    postTypeName: 'Lead Magnet & Resource Drop',
    lengthHint: 'short',
  },
  {
    sectionRole: 'signoff',
    title: 'Lead magnet sign-off',
    content: 'Jahronimo — ANEXTVID.',
    collectionName: 'Lead Magnets',
    postTypeName: 'Lead Magnet & Resource Drop',
    lengthHint: null,
  },
  {
    sectionRole: 'hashtags',
    title: 'Lead magnet tags',
    content: '#VideoStrategy #ContentPlanning #ANEXTVID',
    collectionName: 'Lead Magnets',
    postTypeName: 'Lead Magnet & Resource Drop',
    lengthHint: 'short',
  },

  // ============================================================================
  // Website & Portfolio (Traffic without link-drop friction)
  // ============================================================================
  {
    sectionRole: 'hook',
    title: 'What your website says in 5 seconds',
    content:
      'Your website has about five seconds to explain what you do, who it is for, and why someone should care.',
    collectionName: 'Website & Portfolio',
    postTypeName: 'Website & Portfolio Traffic',
    lengthHint: 'short',
  },
  {
    sectionRole: 'hook',
    title: 'Updated the ANEXTVID portfolio',
    content:
      'I rebuilt how we present our work on the ANEXTVID website this week.',
    collectionName: 'Website & Portfolio',
    postTypeName: 'Website & Portfolio Traffic',
    lengthHint: 'short',
  },
  {
    sectionRole: 'hook',
    title: 'People check your site before they reply',
    content:
      'Most people who reach out on LinkedIn quietly check your website first.',
    collectionName: 'Website & Portfolio',
    postTypeName: 'Website & Portfolio Traffic',
    lengthHint: 'short',
  },
  {
    sectionRole: 'context',
    title: 'Why pretty galleries are not enough',
    content:
      'A grid of nice photos without context leaves buyers guessing: how does the process work, what does a shoot involve, and is this built for a business like mine?',
    collectionName: 'Website & Portfolio',
    postTypeName: 'Website & Portfolio Traffic',
    lengthHint: 'standard',
  },
  {
    sectionRole: 'body',
    title: 'What we put on the new site',
    content:
      'Instead of burying everything behind a generic contact form, the site now lays out:\n\n• Real photography and video examples grouped by business use case.\n• How our short discovery consultation works before any proposal.\n• Clear scope options — from single-project shoots to ongoing content.',
    collectionName: 'Website & Portfolio',
    postTypeName: 'Website & Portfolio Traffic',
    lengthHint: 'standard',
  },
  {
    sectionRole: 'body',
    title: 'Three things every service website needs',
    content:
      'When someone lands on your site, three things do the heavy lifting:\n\n1. Plain-English headline above the fold.\n2. Visual proof that matches the level of client you want.\n3. One low-friction next step (a 5-minute fit call, not a 12-field form).',
    collectionName: 'Website & Portfolio',
    postTypeName: 'Website & Portfolio Traffic',
    lengthHint: 'standard',
  },
  {
    sectionRole: 'proof',
    title: 'Clear scope saves everyone time',
    content:
      'Every time we make the scope and starting process clearer up front, the first conversation gets sharper and more productive.',
    collectionName: 'Website & Portfolio',
    postTypeName: 'Website & Portfolio Traffic',
    lengthHint: 'short',
  },
  {
    sectionRole: 'question',
    title: 'Link in first comment CTA',
    content:
      'If you want to see how we structured it — or browse recent work — I\'ve dropped the link in the first comment.\n\nWhat is the first thing you look for on a creative studio\'s website?',
    collectionName: 'Website & Portfolio',
    postTypeName: 'Website & Portfolio Traffic',
    lengthHint: 'standard',
  },
  {
    sectionRole: 'question',
    title: 'Profile link + honest feedback CTA',
    content:
      'The updated site is linked on my profile. If you take a look, I\'d genuinely value one honest note on what feels clearest — or what is still missing.',
    collectionName: 'Website & Portfolio',
    postTypeName: 'Website & Portfolio Traffic',
    lengthHint: 'short',
  },
  {
    sectionRole: 'signoff',
    title: 'Website post sign-off',
    content: 'ANEXTVID — creative work with purpose.',
    collectionName: 'Website & Portfolio',
    postTypeName: 'Website & Portfolio Traffic',
    lengthHint: null,
  },
  {
    sectionRole: 'hashtags',
    title: 'Website & portfolio tags',
    content: '#ANEXTVID #BrandPresence #CreativeStudio',
    collectionName: 'Website & Portfolio',
    postTypeName: 'Website & Portfolio Traffic',
    lengthHint: 'short',
  },

  // ============================================================================
  // Product & SaaS (Problem-first + micro-demo + build-in-public)
  // ============================================================================
  {
    sectionRole: 'graphic_note',
    title: 'Stop writing LinkedIn posts from a blank box',
    content: 'Stop starting every LinkedIn post from a blank box.',
    collectionName: 'Product & SaaS',
    postTypeName: 'Product & Feature Spotlight',
    lengthHint: 'short',
  },
  {
    sectionRole: 'hook',
    title: 'Why we built a modular post builder',
    content:
      'I got tired of scattering hooks in one note, stories in another, and scheduling in a third tool.',
    collectionName: 'Product & SaaS',
    postTypeName: 'Product & Feature Spotlight',
    lengthHint: 'short',
  },
  {
    sectionRole: 'hook',
    title: 'No "thrilled to announce" launch',
    content:
      'Instead of a "thrilled to announce" post, here is the actual problem we built this tool to fix.',
    collectionName: 'Product & SaaS',
    postTypeName: 'Product & Feature Spotlight',
    lengthHint: 'short',
  },
  {
    sectionRole: 'context',
    title: 'The blank-page bottleneck',
    content:
      'Most founders know what they want to say. The friction is turning rough notes, client questions, and real work into a clean post without losing an hour every morning.',
    collectionName: 'Product & SaaS',
    postTypeName: 'Product & Feature Spotlight',
    lengthHint: 'standard',
  },
  {
    sectionRole: 'body',
    title: 'How the modular copywriting workflow works',
    content:
      'So we built a modular Copywriting Studio directly inside our scheduling workflow:\n\n1. Organise your own hooks, proof, takeaways, and CTAs into collections.\n2. Pick a post formula (Short Visual, Discovery, Case Breakdown, or Myth & Nuance).\n3. Snap sections together, edit in your own voice, and schedule straight to LinkedIn.',
    collectionName: 'Product & SaaS',
    postTypeName: 'Product & Feature Spotlight',
    lengthHint: 'standard',
  },
  {
    sectionRole: 'body',
    title: 'Built for real voice, not generic AI fluff',
    content:
      'The goal was never to generate generic posts at the click of a button.\n\nIt was to keep your own phrasing, your own formatting, and your own examples in one place so you can assemble a grounded post in minutes.',
    collectionName: 'Product & SaaS',
    postTypeName: 'Product & Feature Spotlight',
    lengthHint: 'standard',
  },
  {
    sectionRole: 'proof',
    title: 'Built from our own LinkedIn text bank',
    content:
      'Every formula in the studio started as our own messy folder of modular LinkedIn parts — tested on real posts before we turned it into software.',
    collectionName: 'Product & SaaS',
    postTypeName: 'Product & Feature Spotlight',
    lengthHint: 'short',
  },
  {
    sectionRole: 'question',
    title: 'Early tester / comment CTA',
    content:
      'If you post on LinkedIn regularly and want to test the workflow, comment "BUILDER" and I\'ll share access details.\n\nHow are you currently organising your post ideas?',
    collectionName: 'Product & SaaS',
    postTypeName: 'Product & Feature Spotlight',
    lengthHint: 'standard',
  },
  {
    sectionRole: 'signoff',
    title: 'Product post sign-off',
    content: 'Jahronimo — ANEXTVID.',
    collectionName: 'Product & SaaS',
    postTypeName: 'Product & Feature Spotlight',
    lengthHint: null,
  },
  {
    sectionRole: 'hashtags',
    title: 'Product & SaaS tags',
    content: '#BuildInPublic #ContentWorkflow #LinkedInStrategy',
    collectionName: 'Product & SaaS',
    postTypeName: 'Product & Feature Spotlight',
    lengthHint: 'short',
  },

  // ============================================================================
  // Case Breakdowns (Fills Proof + Takeaway roles)
  // ============================================================================
  {
    sectionRole: 'hook',
    title: 'One change that made the whole shoot land',
    content:
      'The biggest difference on a recent project had nothing to do with camera gear.',
    collectionName: 'Case Breakdowns',
    postTypeName: 'Case Breakdown',
    lengthHint: 'short',
  },
  {
    sectionRole: 'context',
    title: 'Starting with scattered visuals',
    content:
      'A business came in with plenty of raw footage and product photos, but none of it worked together across their website and LinkedIn.',
    collectionName: 'Case Breakdowns',
    postTypeName: 'Case Breakdown',
    lengthHint: 'standard',
  },
  {
    sectionRole: 'body',
    title: 'Aligning framing, light, and message',
    content:
      'Before filming anything new, we mapped where each visual would sit — homepage hero, service cards, and short LinkedIn posts — then shot specifically for those placements.',
    collectionName: 'Case Breakdowns',
    postTypeName: 'Case Breakdown',
    lengthHint: 'standard',
  },
  {
    sectionRole: 'proof',
    title: 'Coherent across every touchpoint',
    content:
      'Instead of one-off clips that sat in a folder, the same shoot gave them a consistent visual thread across their site, proposals, and weekly LinkedIn updates.',
    collectionName: 'Case Breakdowns',
    postTypeName: 'Case Breakdown',
    lengthHint: 'standard',
  },
  {
    sectionRole: 'takeaway',
    title: 'Plan distribution before production',
    content:
      'Decide where the visuals will live before you book the shoot. Distribution shapes framing.',
    collectionName: 'Case Breakdowns',
    postTypeName: 'Case Breakdown',
    lengthHint: 'short',
  },
  {
    sectionRole: 'question',
    title: 'Case breakdown closing question',
    content:
      'Where do your current visuals feel most disconnected — your website, your LinkedIn, or your sales deck?',
    collectionName: 'Case Breakdowns',
    postTypeName: 'Case Breakdown',
    lengthHint: 'short',
  },
  {
    sectionRole: 'signoff',
    title: 'Case breakdown sign-off',
    content: 'ANEXTVID — photography, video & visual production.',
    collectionName: 'Case Breakdowns',
    postTypeName: 'Case Breakdown',
    lengthHint: null,
  },
  {
    sectionRole: 'hashtags',
    title: 'Case breakdown tags',
    content: '#VisualStorytelling #BrandConsistency #ANEXTVID',
    collectionName: 'Case Breakdowns',
    postTypeName: 'Case Breakdown',
    lengthHint: 'short',
  },

  // ============================================================================
  // Myth & Nuance (Contrarian / Grounded Perspective)
  // ============================================================================
  {
    sectionRole: 'hook',
    title: 'You do not need to post every day',
    content: '"You need to post on LinkedIn every single day." — Not if every post says the same thing.',
    collectionName: 'Myth & Nuance',
    postTypeName: 'Myth & Nuance',
    lengthHint: 'short',
  },
  {
    sectionRole: 'hook',
    title: 'Better gear does not fix a weak message',
    content: 'A sharper lens will not fix an unclear offer.',
    collectionName: 'Myth & Nuance',
    postTypeName: 'Myth & Nuance',
    lengthHint: 'short',
  },
  {
    sectionRole: 'context',
    title: 'Why the daily-posting myth sticks',
    content:
      'Volume advice is easy to repeat because it sounds disciplined. For a small team or founder, though, chasing daily posts usually leads to rushed filler.',
    collectionName: 'Myth & Nuance',
    postTypeName: 'Myth & Nuance',
    lengthHint: 'standard',
  },
  {
    sectionRole: 'body',
    title: 'Consistency beats raw frequency',
    content:
      'Two clear, useful posts a week — grounded in real work, real client questions, and honest lessons — compound far better than seven forgettable ones.',
    collectionName: 'Myth & Nuance',
    postTypeName: 'Myth & Nuance',
    lengthHint: 'standard',
  },
  {
    sectionRole: 'body',
    title: 'Clarity first, production value second',
    content:
      'High production value amplifies whatever is already there. If a viewer still cannot tell what you do or who you help, cinema lighting only makes the confusion look prettier.',
    collectionName: 'Myth & Nuance',
    postTypeName: 'Myth & Nuance',
    lengthHint: 'standard',
  },
  {
    sectionRole: 'takeaway',
    title: 'Rule of thumb on cadence',
    content:
      'Pick a cadence you can keep for six months without lowering the bar on what you publish.',
    collectionName: 'Myth & Nuance',
    postTypeName: 'Myth & Nuance',
    lengthHint: 'short',
  },
  {
    sectionRole: 'question',
    title: 'Myth & nuance closing question',
    content:
      'What is one piece of LinkedIn or marketing advice you stopped following because it did not hold up in practice?',
    collectionName: 'Myth & Nuance',
    postTypeName: 'Myth & Nuance',
    lengthHint: 'short',
  },
  {
    sectionRole: 'signoff',
    title: 'Myth & nuance sign-off',
    content: 'Jahronimo — ANEXTVID.',
    collectionName: 'Myth & Nuance',
    postTypeName: 'Myth & Nuance',
    lengthHint: null,
  },
  {
    sectionRole: 'hashtags',
    title: 'Myth & nuance tags',
    content: '#LinkedInMarketing #ContentStrategy #ANEXTVID',
    collectionName: 'Myth & Nuance',
    postTypeName: 'Myth & Nuance',
    lengthHint: 'short',
  },

  // ============================================================================
  // Behind the Work (from 17_Studio_Process_Headline_Covers & 07_Plan_a_Shoot)
  // ============================================================================
  {
    sectionRole: 'graphic_note',
    title: 'Behind the Work',
    content: 'Behind the Work',
    collectionName: 'Behind the Work',
    postTypeName: 'Behind-the-Scenes Process',
    lengthHint: 'short',
  },
  {
    sectionRole: 'graphic_note',
    title: 'Show Your Process',
    content: 'Show Your Process',
    collectionName: 'Behind the Work',
    postTypeName: 'Behind-the-Scenes Process',
    lengthHint: 'short',
  },
  {
    sectionRole: 'graphic_note',
    title: 'Make Your Work Visible',
    content: 'Make Your Work Visible',
    collectionName: 'Behind the Work',
    postTypeName: 'Behind-the-Scenes Process',
    lengthHint: 'short',
  },
  {
    sectionRole: 'hook',
    title: 'Start with what the audience recognises',
    content: 'Start a behind-the-scenes post with the piece that the audience will recognise.',
    collectionName: 'Behind the Work',
    postTypeName: 'Behind-the-Scenes Process',
    lengthHint: 'short',
  },
  {
    sectionRole: 'hook',
    title: 'Document while the tools are out',
    content: 'Document a stage while the tools are out.',
    collectionName: 'Behind the Work',
    postTypeName: 'Behind-the-Scenes Process',
    lengthHint: 'short',
  },
  {
    sectionRole: 'hook',
    title: 'Put a piece of work where someone can see it',
    content: 'Put a piece of work where someone can see it without a long introduction.',
    collectionName: 'Behind the Work',
    postTypeName: 'Behind-the-Scenes Process',
    lengthHint: 'short',
  },
  {
    sectionRole: 'body',
    title: 'One part of the setup',
    content: 'Then show one part of the setup that helped it come together.',
    collectionName: 'Behind the Work',
    postTypeName: 'Behind-the-Scenes Process',
    lengthHint: 'short',
  },
  {
    sectionRole: 'body',
    title: 'What you are checking before moving on',
    content: 'Explain what you are checking and what tells you that the work is ready to move on.',
    collectionName: 'Behind the Work',
    postTypeName: 'Behind-the-Scenes Process',
    lengthHint: 'short',
  },
  {
    sectionRole: 'body',
    title: 'Clear title and one line of context',
    content: 'A clear title and one line of context give a first-time visitor a place to start.',
    collectionName: 'Behind the Work',
    postTypeName: 'Behind-the-Scenes Process',
    lengthHint: 'short',
  },
  {
    sectionRole: 'question',
    title: 'Most useful behind-the-scenes detail',
    content: 'What is the most useful behind-the-scenes detail you could share?',
    collectionName: 'Behind the Work',
    postTypeName: 'Behind-the-Scenes Process',
    lengthHint: 'short',
  },
  {
    sectionRole: 'question',
    title: 'Show instead of describe',
    content: 'What part of your process could you show instead of describe?',
    collectionName: 'Behind the Work',
    postTypeName: 'Behind-the-Scenes Process',
    lengthHint: 'short',
  },
  {
    sectionRole: 'signoff',
    title: 'From Jahronimo at ANEXTVID.',
    content: 'From Jahronimo at ANEXTVID.',
    collectionName: 'Behind the Work',
    postTypeName: 'Behind-the-Scenes Process',
    lengthHint: null,
  },
  {
    sectionRole: 'signoff',
    title: 'ANEXTVID — Practical creativity.',
    content: 'ANEXTVID — Practical creativity.',
    collectionName: 'Behind the Work',
    postTypeName: 'Behind-the-Scenes Process',
    lengthHint: null,
  },
  {
    sectionRole: 'hashtags',
    title: 'Studio process tags',
    content: '#VideoProduction #VisualStorytelling #CreativeDirection',
    collectionName: 'Behind the Work',
    postTypeName: 'Behind-the-Scenes Process',
    lengthHint: 'short',
  },

  // ============================================================================
  // Founder-Led Video & Brand (from 20_Violet_Video_Service_Covers & 16_Personal_Branding_Headlines)
  // ============================================================================
  {
    sectionRole: 'graphic_note',
    title: 'Founder-Led Content',
    content: 'Founder-Led Content',
    collectionName: 'Founder-Led Video & Brand',
    postTypeName: 'Founder Video & Positioning',
    lengthHint: 'short',
  },
  {
    sectionRole: 'graphic_note',
    title: 'Turn Expertise Into Video',
    content: 'Turn Expertise Into Video',
    collectionName: 'Founder-Led Video & Brand',
    postTypeName: 'Founder Video & Positioning',
    lengthHint: 'short',
  },
  {
    sectionRole: 'graphic_note',
    title: 'Show How You Think',
    content: 'Show How You Think',
    collectionName: 'Founder-Led Video & Brand',
    postTypeName: 'Founder Video & Positioning',
    lengthHint: 'short',
  },
  {
    sectionRole: 'hook',
    title: 'Start with the job the video needs to do',
    content: 'Start with the job the video needs to do.',
    collectionName: 'Founder-Led Video & Brand',
    postTypeName: 'Founder Video & Positioning',
    lengthHint: 'short',
  },
  {
    sectionRole: 'hook',
    title: 'Explain a decision you make often',
    content: 'Ask the founder to explain a decision they make often.',
    collectionName: 'Founder-Led Video & Brand',
    postTypeName: 'Founder Video & Positioning',
    lengthHint: 'short',
  },
  {
    sectionRole: 'hook',
    title: 'Show how something actually works',
    content: 'Video gives you a chance to show how something actually works.',
    collectionName: 'Founder-Led Video & Brand',
    postTypeName: 'Founder Video & Positioning',
    lengthHint: 'short',
  },
  {
    sectionRole: 'body',
    title: 'Service page vs interview clips',
    content:
      'A short explanation for a service page asks for a different plan from a set of interview clips for LinkedIn.',
    collectionName: 'Founder-Led Video & Brand',
    postTypeName: 'Founder Video & Positioning',
    lengthHint: 'short',
  },
  {
    sectionRole: 'body',
    title: 'Turn a call question into a filmed reply',
    content:
      'Take a question you answer on calls and film a short reply. If you can show a tool, sample or step while you explain it, build that into the shot.',
    collectionName: 'Founder-Led Video & Brand',
    postTypeName: 'Founder Video & Positioning',
    lengthHint: 'short',
  },
  {
    sectionRole: 'body',
    title: 'Show the judgement behind the result',
    content:
      'Put two options side by side. Explain what made one fit the brief better so the reader gets to see the judgement behind the result.',
    collectionName: 'Founder-Led Video & Brand',
    postTypeName: 'Founder Video & Positioning',
    lengthHint: 'short',
  },
  {
    sectionRole: 'question',
    title: 'What should the viewer do after watching',
    content: 'What do you want the viewer to do after watching?',
    collectionName: 'Founder-Led Video & Brand',
    postTypeName: 'Founder Video & Positioning',
    lengthHint: 'short',
  },
  {
    sectionRole: 'question',
    title: 'Which customer question could become a demo',
    content: 'Which customer question could become a demonstration?',
    collectionName: 'Founder-Led Video & Brand',
    postTypeName: 'Founder Video & Positioning',
    lengthHint: 'short',
  },
  {
    sectionRole: 'signoff',
    title: 'Jahronimo Ellis — Website card',
    content: 'Jahronimo Ellis\nFounder of ANEXTVID\nhttps://www.anextvid.com',
    collectionName: 'Founder-Led Video & Brand',
    postTypeName: 'Founder Video & Positioning',
    lengthHint: null,
  },
  {
    sectionRole: 'signoff',
    title: 'Jahronimo Ellis — Email card',
    content: 'Jahronimo Ellis\nFounder of ANEXTVID\nanextvid@gmail.com',
    collectionName: 'Founder-Led Video & Brand',
    postTypeName: 'Founder Video & Positioning',
    lengthHint: null,
  },
  {
    sectionRole: 'hashtags',
    title: 'Founder video tags',
    content: '#ANEXTVID #PersonalBranding #VideoProduction',
    collectionName: 'Founder-Led Video & Brand',
    postTypeName: 'Founder Video & Positioning',
    lengthHint: 'short',
  },

  // ============================================================================
  // Writing & Content Craft (from 24_LinkedIn_Laptop_Portraits)
  // ============================================================================
  {
    sectionRole: 'hook',
    title: 'Write the rough thought while it is fresh',
    content: 'Write the rough thought while it is still fresh.',
    collectionName: 'Writing & Content Craft',
    postTypeName: 'Content Workflow & Notes',
    lengthHint: 'short',
  },
  {
    sectionRole: 'hook',
    title: 'Explain it as a voice note first',
    content: 'Try explaining the idea as a voice note before typing it.',
    collectionName: 'Writing & Content Craft',
    postTypeName: 'Content Workflow & Notes',
    lengthHint: 'short',
  },
  {
    sectionRole: 'body',
    title: 'A sentence from a conversation beats an empty draft',
    content:
      'A sentence from a conversation or a decision from the day can give you a clearer beginning than an empty draft.',
    collectionName: 'Writing & Content Craft',
    postTypeName: 'Content Workflow & Notes',
    lengthHint: 'short',
  },
  {
    sectionRole: 'body',
    title: 'Keep one clear example near the opening',
    content:
      'When a draft is getting long, find the example that does the most work. Keep it near the opening so the reader understands where the post is going.',
    collectionName: 'Writing & Content Craft',
    postTypeName: 'Content Workflow & Notes',
    lengthHint: 'short',
  },
  {
    sectionRole: 'question',
    title: 'Does your intro sound like your business',
    content: 'Does your current introduction sound like the business you run?',
    collectionName: 'Writing & Content Craft',
    postTypeName: 'Content Workflow & Notes',
    lengthHint: 'short',
  },
  {
    sectionRole: 'signoff',
    title: 'ANEXTVID — Stories worth showing.',
    content: 'ANEXTVID — Stories worth showing.',
    collectionName: 'Writing & Content Craft',
    postTypeName: 'Content Workflow & Notes',
    lengthHint: null,
  },
  {
    sectionRole: 'hashtags',
    title: 'Content craft tags',
    content: '#LinkedIn #ContentStrategy #PersonalBranding',
    collectionName: 'Writing & Content Craft',
    postTypeName: 'Content Workflow & Notes',
    lengthHint: 'short',
  },

  // ============================================================================
  // Buyer Questions & Objections (from EXP-FAQ & Commercial Boundaries)
  // ============================================================================
  {
    sectionRole: 'hook',
    title: 'One hero video or a weekly bank of clips?',
    content: 'Do you need one main brand video, or a bank of shorter clips for LinkedIn?',
    collectionName: 'Buyer Questions & Objections',
    postTypeName: 'Buyer FAQ & Scope',
    lengthHint: 'short',
  },
  {
    sectionRole: 'hook',
    title: 'What happens on a 5-minute fit call?',
    content: 'People sometimes hesitate to book a discovery call because they expect a hard pitch.',
    collectionName: 'Buyer Questions & Objections',
    postTypeName: 'Buyer FAQ & Scope',
    lengthHint: 'short',
  },
  {
    sectionRole: 'context',
    title: 'Why format and cadence depend on the goal',
    content:
      'Most businesses are told they need a full production day before anyone has checked where the footage will actually live or how often they plan to publish.',
    collectionName: 'Buyer Questions & Objections',
    postTypeName: 'Buyer FAQ & Scope',
    lengthHint: 'standard',
  },
  {
    sectionRole: 'body',
    title: 'Matching shoot scope to real usage',
    content:
      'If your website needs one clear introduction, a focused single-video shoot makes sense. If your team is posting weekly on LinkedIn, filming modular clips in one structured session usually goes much further.',
    collectionName: 'Buyer Questions & Objections',
    postTypeName: 'Buyer FAQ & Scope',
    lengthHint: 'standard',
  },
  {
    sectionRole: 'body',
    title: 'How we run an initial fit call',
    content:
      'Our first 5-minute conversation is just to check fit: what you are trying to communicate, what you already have, and whether photography, video, or ongoing support makes sense for your budget and timeframe.',
    collectionName: 'Buyer Questions & Objections',
    postTypeName: 'Buyer FAQ & Scope',
    lengthHint: 'standard',
  },
  {
    sectionRole: 'takeaway',
    title: 'Start with the smallest scope that works',
    content: 'Start with the smallest scope that answers the buyer question clearly.',
    collectionName: 'Buyer Questions & Objections',
    postTypeName: 'Buyer FAQ & Scope',
    lengthHint: 'short',
  },
  {
    sectionRole: 'question',
    title: 'Buyer FAQ closing prompt',
    content: 'What do people most often ask you before they feel ready to start a project?',
    collectionName: 'Buyer Questions & Objections',
    postTypeName: 'Buyer FAQ & Scope',
    lengthHint: 'short',
  },
  {
    sectionRole: 'signoff',
    title: 'Buyer FAQ sign-off',
    content: 'Jahronimo — founder, ANEXTVID.',
    collectionName: 'Buyer Questions & Objections',
    postTypeName: 'Buyer FAQ & Scope',
    lengthHint: null,
  },
  {
    sectionRole: 'hashtags',
    title: 'Buyer FAQ tags',
    content: '#ANEXTVID #VideoStrategy #B2BMarketing',
    collectionName: 'Buyer Questions & Objections',
    postTypeName: 'Buyer FAQ & Scope',
    lengthHint: 'short',
  },
];
