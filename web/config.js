// All event details live here (NFR-09). After editing, also update the matching Script Properties
// in Apps Script (BRANCHES, OTHER_BRANCH, RSVP_DEADLINE, SHOW_PUBLIC_LISTS, SHOW_PUBLIC_MESSAGES, CONTACT).

export default {
  grandfather: 'Grado',
  grandmother: 'Teresa',
  date: 'December 2026 (exact date to be confirmed)',
  venue: "Ong'aria's Homestead (Indangalasia)",
  mapsUrl: '',                             // a Google Maps pin link; empty hides "Get directions"
  host: '',                                // shown as "Hosted by …"; empty hides the line
  saying: '',                              // the family saying in the band at the foot of the header; empty hides it

  // One branch per child of the grandparents, in birth order. Empty (with otherBranchLabel empty)
  // switches the branch question and the branch table off.
  branches: [],
  otherBranchLabel: '',

  rsvpDeadline: '',                        // 'YYYY-MM-DD'; replies close at the end of that day, Nairobi time
  showPublicLists: false,                  // false = names visible to the hosts only, in the sheet
  showPublicMessages: false,

  contact: { name: 'Uncle Gilly', phone: '0725 433 625' },

  // The Apps Script /exec URL. Empty = preview mode (replies saved on this device only).
  apiUrl: 'https://script.google.com/macros/s/AKfycbwUqcEBpskePpFLpmXhzCGfnS5njbicf-JAuxeJHl6tDF-v_DN9U-7T5bWnt8aZ3lu4Pw/exec',

  // The public link people share. Empty = the address the page was opened from.
  siteUrl: 'https://ongaria-homecoming.netlify.app/',
};
