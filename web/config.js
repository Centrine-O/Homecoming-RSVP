// All event details live here (NFR-09). Text in [square brackets] is waiting for an answer
// from docs/REQUIREMENTS.md section 3. After editing, also update the matching Script Properties
// in Apps Script (BRANCHES, OTHER_BRANCH, RSVP_DEADLINE, SHOW_PUBLIC_LISTS, SHOW_PUBLIC_MESSAGES, CONTACT).

export default {
  grandfather: '[Grandfather]',            // Q1
  grandmother: '[Grandmother]',            // Q2
  date: '[Day, date and time]',            // Q4, e.g. 'Saturday 19 December 2026, 10 am to evening'
  venue: '[Home name, village]',           // Q5
  mapsUrl: '',                             // Q5, a Google Maps pin link; empty hides "Get directions"
  host: '[Host name]',                     // shown as "Hosted by …"
  saying: '[Family saying]',               // shown in the band at the foot of the header

  // Q3: one branch per child of the grandparents, in birth order.
  branches: [
    'Family of [first child]',
    'Family of [second child]',
    'Family of [third child]',
  ],
  otherBranchLabel: 'Other / friend of the family',

  rsvpDeadline: '',                        // Q6, 'YYYY-MM-DD'; replies close at the end of that day, Nairobi time
  showPublicLists: true,                   // Q7, false = names visible to the hosts only
  showPublicMessages: true,                // Q8

  // Q14
  contact: { name: '[Contact name]', phone: '' },

  // The Apps Script /exec URL. Empty = preview mode (replies saved on this device only).
  apiUrl: '',

  // The public link people share. Empty = the address the page was opened from.
  siteUrl: 'https://centrine-o.github.io/Homecoming-RSVP/',
};
