// English texts. TypeScript checks that every key of vi.ts is present.
import type vi from './vi';

const en: Record<keyof typeof vi, string> = {
  // Common
  retry: 'Retry',
  tapToRetry: 'Tap to retry',
  cancel: 'Cancel',
  close: 'Close',
  delete: 'Delete',
  save: 'Save',
  error: 'Error',
  loading: 'Loading...',
  reloading: 'Refreshing...',
  back: 'Back',
  settings: 'Settings',
  yourLocation: 'Your location',

  // Tabs
  tabHome: 'Home',
  tabForecast: 'Forecast',
  tabSkills: 'Skills',
  tabCommunity: 'Community',

  // Errors from services
  errTimeout: 'The server took too long to respond. Please try again.',
  errOffline: 'Cannot reach the server. Check your internet connection.',
  errGeneric: 'Something went wrong. Please try again.',
  errLocationPermission: 'Location permission has not been granted.',
  errLocationUnavailable: 'Could not get your location. Turn on GPS or choose a location manually.',
  errLocationShort: 'Could not get your location.',

  // Notification permission
  notifPermTitle: 'Get disaster alerts',
  notifPermMessage:
    'FloodShield will notify you about heavy rain, floods, storms and other disasters near your location.',
  notifPermAllow: 'Allow',
  notifPermLater: 'Not now',

  // Weather header
  locating: 'Finding your location...',
  loadingWeather: 'Loading the weather...',
  noLocation: 'No location yet',
  weatherFailed: 'Could not load the weather',
  chooseYourLocation: 'Choose your location',
  changeLocation: 'Change location',
  updated: 'UPDATED',
  wind: 'WIND',
  feelsLike: 'FEELS LIKE',
  humidity: 'HUMIDITY',
  weatherAttribution: 'Weather data: Open-Meteo.com',
  sunrise: 'Sunrise',
  sunset: 'Sunset',

  // Home
  alertsCount: 'Alerts ({count})',
  emergencyAlert: 'Emergency alert!',
  severityLabel: 'Severity:',
  alertsLoadFailed: 'Could not load alerts',
  noAlerts: 'No alerts',
  noAlertsForArea: 'There are no disaster alerts for your area right now.',
  chooseLocationForAlerts: 'Choose a location to get alerts for your area.',
  alertDetails: 'Alert details',
  responseSkills: 'What to do',
  support: 'Help',
  nearbyShelters: 'Nearby shelters',
  emergencyContacts: 'Emergency numbers',

  // Severity
  severity_info: 'Watch',
  severity_moderate: 'Warning',
  severity_high: 'Dangerous',
  severity_severe: 'Very dangerous',

  // Forecast tabs
  tabWeather: 'WEATHER',
  tabRiver: 'RIVER',
  tabAlerts: 'ALERTS',
  next24h: 'Next 24 hours',
  now: 'Now',
  nextDays: 'Next {count} days',
  today: 'Today',

  // Alerts tab
  ongoing: 'Ongoing',
  timeLabel: 'When: {text}',
  noAlertsNext3Days: 'No disaster alerts for your area in the next 3 days.',
  chooseLocationShort: 'Choose a location to get alerts.',
  areaLabel: 'Area: {area}',
  viewDetails: 'Details',
  alertSources:
    'Sources: Open-Meteo, GloFAS, GDACS and local authorities. Always follow the instructions of the authorities.',
  sourceLabel: 'Source: {source}',
  fullReport: 'Full report ↗',
  severityWithLabel: 'Severity: {label}',
  viewResponseSkills: 'What to do',

  // River flood tab
  flood2y: '2-year flood',
  flood5y: '5-year flood',
  flood20y: '20-year flood',
  flowRange: '  (range {low}–{high})',
  chartHint: 'Touch the chart to see each day',
  chartA11y: 'Chart of the river flow forecast',
  legendFlow: 'Flow (m³/s)',
  legendRange: 'Forecast range',
  chooseLocationForFlood: 'Choose a location to see the flood forecast.',
  analysingRiver: 'Analysing river data...',
  floodRisk: 'Flood risk: {label}',
  nearestRiver: 'Nearest large river is about {km} km away',
  riverForecastTitle: 'River flow forecast, next {count} days',
  hideTable: 'Hide the data table',
  showTable: 'Show the data table',
  pastDay: ' (past)',
  floodAttribution:
    'Data: GloFAS (Copernicus Emergency Management Service) via Open-Meteo. Flood levels are estimated from 20 years of data. For guidance only; follow the official hydro-meteorological bulletins.',

  // Skills
  skillsTitle: 'DISASTER RESPONSE SKILLS',
  forYou: 'For you',
  thingsToDo: '{name}: {count} things to do',
  relatedToAlert: '⚠️ Related to a current alert',
  checklist: 'Checklist',
  noInfo: 'No information for this item yet.',
  openChecklist: 'Open the "{name}" checklist',
  reset: 'Reset',
  relatedTo: 'Related to: {title}',
  progress: '{done}/{total} done',

  // Shelters
  official: 'Official',
  distanceFromYou: '{distance} away',
  capacity: ' · Room for {count} people',
  directionsTo: 'Directions to {name}',
  directions: 'Directions',
  callPlace: 'Call {name}',
  findingShelters: 'Finding shelters near you...',
  sheltersHint:
    'Schools, community centres, ward offices (UBND) and hospitals are commonly used as evacuation places. Always follow the instructions of local authorities.',
  noLocationSettings: 'No location yet. Choose one in Settings.',
  noShelters: 'No evacuation places found within 15 km.',
  mapAttribution: 'Map data © OpenStreetMap contributors',

  // Emergency contacts
  contact115: 'Ambulance',
  contact114: 'Fire and rescue',
  contact113: 'Police',
  contact112: 'Search and rescue',
  contact111: 'Child protection',
  callNumberQ: 'Call {number}?',
  call: 'Call',
  contactA11y: '{name}, number {number}. Tap to call',
  slideToCall: 'Slide to call >>>',
  emergencyFooter:
    'Emergency numbers are free from any phone. Say clearly where you are, what happened and how many people need help.',

  // Community feed
  category_flood: '🌊 Flooding',
  category_landslide: '⛰️ Landslide',
  category_storm: '🌀 Storm, strong wind',
  category_rescue: '🆘 Needs rescue',
  category_other: '📢 Other',
  water_none: 'No flooding',
  water_ankle: 'Ankle-deep',
  water_knee: 'Knee-deep',
  water_waist: 'Waist-deep',
  water_chest: 'Chest-deep',
  water_over_head: 'Over head height',
  reportPostTitle: 'Report post',
  reportPostQuestion: 'Why are you reporting this post?',
  reasonFalse: 'False information',
  reasonAbuse: 'Offensive or spam',
  thanks: 'Thank you',
  reportedMessage: 'The post has been reported and will be reviewed.',
  hideAuthorQ: 'Hide posts from {name}?',
  hideAuthorMessage: "You won't see this person's posts any more. You can undo this in Settings.",
  hide: 'Hide',
  deletePostQ: 'Delete post?',
  deletePostMessage: 'The post will be deleted permanently.',
  yourPost: 'Your post',
  deletePost: 'Delete post',
  options: 'Options',
  reportAbuse: 'Report',
  hideThisAuthor: 'Hide posts from this person',
  postOptions: 'Post options',
  iSeeItToo: '👁 I see it too',
  sendRealAlert: 'SHARE WHAT YOU SEE',
  realAlertsNearYou: 'Reports near you',
  feedSubtitle: 'Within 50 km, last 7 days. Updates every minute.',
  noPosts: 'No reports near you yet. Be the first to share the situation!',

  // New report
  communityRulesTitle: 'Community rules',
  communityRules:
    '• Only share real information that you have seen yourself.\n' +
    "• Don't post offensive content, ads, scams or other people's personal information.\n" +
    '• Your post, photo and location will be shown publicly.\n' +
    '• Posts that break the rules will be hidden or deleted.\n' +
    '• If you are in danger, call 112 / 114 / 115 first.',
  agree: 'I agree',
  currentGps: 'Current GPS location',
  locationFailed: 'Could not get your location',
  cannotOpen: 'Cannot open',
  pleaseRetry: 'Please try again.',
  missingLocation: 'No location',
  missingLocationMessage: 'Allow location access or choose a location first.',
  missingName: 'No name',
  missingNameMessage: 'Enter the name to show with your post.',
  missingDescription: 'No description',
  missingDescriptionMessage: 'Briefly describe the situation where you are.',
  sent: 'Sent',
  sentMessage: 'Thank you for sharing with the community!',
  sendFailed: 'Could not send',
  newReportTitle: 'Share what you see',
  incidentType: 'What is happening',
  waterLevel: 'Water level',
  description: 'Description',
  descriptionPlaceholder: 'E.g. Nguyen Huu Canh street is deeply flooded, motorbikes cannot pass',
  location: 'Location',
  useGps: 'Use GPS',
  displayName: 'Display name',
  yourName: 'Your name',
  addPhoto: 'Add a photo',
  removePhoto: '✕ Remove photo',
  takePhoto: 'Take photo',
  choosePhoto: 'Choose photo',
  publicNote:
    'Your post, photo and location will be public. GPS data is removed from photos before posting.',
  submitReport: 'Send report',

  // Location picker
  chooseLocation: 'Choose location',
  useCurrentLocation: '📍 Use my current location (GPS)',
  searchPlaceholder: 'Search for a province, city, ward...',
  searchResults: 'Search results',
  bigCities: 'Major cities',
  noPlaces: 'No matching places found.',

  // Settings
  deleteMyDataQ: 'Delete my data?',
  deleteMyDataMessage:
    'All posts, photos and confirmations you sent will be deleted from the server. This cannot be undone.',
  deleted: 'Deleted',
  deletedPosts: '{count} posts deleted.',
  deleteFailed: 'Could not delete',
  saved: 'Saved',
  serverIs: 'Server: {url}',
  sectionLocation: 'Location',
  manualLocationHint: 'Chosen manually · Tap to change',
  gpsLocationHint: 'From GPS · Tap to choose another place',
  useGpsLocation: 'Use GPS location',
  sectionNotifications: 'Notifications',
  disasterAlerts: 'Disaster alerts',
  disasterAlertsHint: 'Checks about every 30 minutes, even when the app is closed',
  checkNow: 'Check for alerts now',
  checking: 'Checking',
  checkingMessage: "You'll get a notification if there is a new alert.",
  sectionCommunity: 'Community',
  nicknameNotSet: 'Not set (set when you post)',
  unhideAll: 'Show hidden people again',
  hiddenCount: '{count} people hidden',
  deleteMyData: 'Delete my data',
  sectionLanguage: 'Ngôn ngữ / Language',
  sectionInfo: 'About',
  privacyPolicy: 'Privacy policy',
  dataSources: 'Data sources',
  dataSourcesList:
    'Weather: Open-Meteo.com (CC BY 4.0)\n' +
    'River floods: GloFAS - Copernicus Emergency Management Service\n' +
    'Disasters: GDACS (United Nations & European Commission)\n' +
    'Maps, shelters: © OpenStreetMap contributors',
  note: 'Note',
  disclaimer:
    "For guidance only. Always follow the instructions of the authorities and of Vietnam's National Center for Hydro-Meteorological Forecasting (nchmf.gov.vn).",
  version: 'Version {version}',
  showAdvanced: 'Tap to show advanced settings',
  apiServer: 'API server',

  // Dates
  longDate: '{weekday}, {day} {monthName} {year}',
  justNow: 'Just now',
  minutesAgo: '{count} min ago',
  hoursAgo: '{count} h ago',
  daysAgo: '{count} days ago',
};

export default en;
