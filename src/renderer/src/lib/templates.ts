export interface Template {
  id: string
  name: string
  description: string
  instructions: string
}

export const TEMPLATES: Template[] = [
  {
    id: 'general',
    name: 'General meeting',
    description: 'Topics discussed and action items',
    instructions:
      'Group the notes into 3 to 6 sections, each named after a topic that was actually discussed. Finish with a "### Action items" section listing who will do what, when known.'
  },
  {
    id: 'one-on-one',
    name: '1:1',
    description: 'Updates, discussion, feedback, next steps',
    instructions: 'Use these sections: "### Updates", "### Discussion", "### Feedback", "### Action items".'
  },
  {
    id: 'standup',
    name: 'Stand-up',
    description: 'Progress, plans and blockers per person',
    instructions:
      'Use these sections: "### Done", "### Doing next", "### Blockers". Prefix bullets with the person\'s name when known.'
  },
  {
    id: 'customer',
    name: 'Customer call',
    description: 'Context, pain points, requirements, next steps',
    instructions:
      'Use these sections: "### Customer context", "### Pain points", "### Requirements", "### Objections & concerns", "### Next steps".'
  },
  {
    id: 'interview',
    name: 'Interview',
    description: 'Background, strengths, concerns',
    instructions:
      'Use these sections: "### Background", "### Strengths", "### Concerns", "### Notable answers", "### Follow-ups". Stay factual; do not give a hiring verdict.'
  },
  {
    id: 'brainstorm',
    name: 'Brainstorm',
    description: 'Ideas, favorites and open questions',
    instructions:
      'Use these sections: "### Problem", "### Ideas", "### Favorites & why", "### Open questions", "### Next steps".'
  },
  {
    id: 'lecture',
    name: 'Lecture',
    description: 'Key concepts and things to review',
    instructions:
      'Use these sections: "### Key concepts", "### Details & examples", "### Questions raised", "### To review".'
  }
]

export const templateById = (id: string): Template => TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0]
