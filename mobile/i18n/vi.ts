// Vietnamese texts (default language). Every key must also exist in en.ts.
// Placeholders like {count} are filled in by t('key', {count: 3}).

const vi = {
  // Common
  retry: 'Thử lại',
  tapToRetry: 'Nhấn để thử lại',
  cancel: 'Hủy',
  close: 'Đóng',
  delete: 'Xóa',
  save: 'Lưu',
  error: 'Lỗi',
  loading: 'Đang tải...',
  reloading: 'Đang tải lại...',
  back: 'Quay lại',
  settings: 'Cài đặt',
  yourLocation: 'Vị trí của bạn',

  // Tabs
  tabHome: 'Trang chủ',
  tabForecast: 'Dự báo',
  tabSkills: 'Kỹ năng',
  tabCommunity: 'Cộng đồng',

  // Errors from services
  errTimeout: 'Máy chủ phản hồi quá lâu. Vui lòng thử lại.',
  errOffline: 'Không kết nối được máy chủ. Kiểm tra kết nối mạng.',
  errGeneric: 'Đã có lỗi xảy ra. Vui lòng thử lại.',
  errLocationPermission: 'Bạn chưa cấp quyền truy cập vị trí.',
  errLocationUnavailable: 'Không lấy được vị trí. Hãy bật GPS hoặc chọn vị trí thủ công.',
  errLocationShort: 'Không lấy được vị trí.',

  // Notification permission
  notifPermTitle: 'Nhận cảnh báo thiên tai',
  notifPermMessage:
    'FloodShield sẽ thông báo khi có mưa lớn, lũ, bão hoặc thiên tai gần vị trí của bạn.',
  notifPermAllow: 'Đồng ý',
  notifPermLater: 'Để sau',

  // Weather header
  locating: 'Đang xác định vị trí...',
  loadingWeather: 'Đang tải dữ liệu thời tiết...',
  noLocation: 'Chưa có vị trí',
  weatherFailed: 'Không thể tải dữ liệu thời tiết',
  chooseYourLocation: 'Chọn vị trí của bạn',
  changeLocation: 'Đổi vị trí',
  updated: 'CẬP NHẬT',
  wind: 'GIÓ',
  feelsLike: 'CẢM THẤY',
  humidity: 'ĐỘ ẨM',
  sunrise: 'Bình minh',
  sunset: 'Hoàng hôn',

  // Home
  alertsCount: 'Cảnh báo ({count})',
  emergencyAlert: 'Cảnh báo khẩn cấp!',
  severityLabel: 'Mức độ:',
  alertsLoadFailed: 'Chưa tải được cảnh báo',
  noAlerts: 'Không có cảnh báo',
  noAlertsForArea: 'Hiện chưa có cảnh báo thiên tai nào cho khu vực của bạn.',
  chooseLocationForAlerts: 'Chọn vị trí để nhận cảnh báo cho khu vực của bạn.',
  alertDetails: 'Chi tiết cảnh báo',
  responseSkills: 'Kỹ năng ứng phó',
  support: 'Hỗ trợ',
  nearbyShelters: 'Nơi sơ tán gần bạn',
  emergencyContacts: 'Liên lạc khẩn cấp',

  // Severity
  severity_info: 'Theo dõi',
  severity_moderate: 'Cảnh báo',
  severity_high: 'Nguy hiểm',
  severity_severe: 'Rất nguy hiểm',

  // Forecast tabs
  tabWeather: 'THỜI TIẾT',
  tabRiver: 'LŨ SÔNG',
  tabAlerts: 'CẢNH BÁO',
  next24h: '24 giờ tới',
  now: 'Bây giờ',
  nextDays: '{count} ngày tới',
  today: 'Hôm nay',

  // Alerts tab
  ongoing: 'Đang diễn ra',
  timeLabel: 'Thời gian: {text}',
  noAlertsNext3Days: 'Không có cảnh báo thiên tai nào cho khu vực của bạn trong 3 ngày tới.',
  chooseLocationShort: 'Chọn vị trí để nhận cảnh báo.',
  areaLabel: 'Khu vực: {area}',
  viewDetails: 'Xem chi tiết',
  alertSources:
    'Nguồn: Open-Meteo, GloFAS, GDACS và cơ quan địa phương. Luôn làm theo hướng dẫn của chính quyền.',
  sourceLabel: 'Nguồn: {source}',
  fullReport: 'Xem báo cáo chi tiết ↗',
  severityWithLabel: 'Mức độ: {label}',
  viewResponseSkills: 'Xem kỹ năng ứng phó',

  // River flood tab
  flood2y: 'Lũ 2 năm',
  flood5y: 'Lũ 5 năm',
  flood20y: 'Lũ 20 năm',
  flowRange: '  (khoảng {low}–{high})',
  chartHint: 'Chạm vào biểu đồ để xem số liệu từng ngày',
  chartA11y: 'Biểu đồ lưu lượng sông dự báo',
  legendFlow: 'Lưu lượng (m³/s)',
  legendRange: 'Khoảng dự báo',
  chooseLocationForFlood: 'Chọn vị trí để xem dự báo lũ.',
  analysingRiver: 'Đang phân tích dữ liệu sông...',
  floodRisk: 'Nguy cơ lũ: {label}',
  nearestRiver: 'Sông lớn gần nhất cách khoảng {km} km',
  riverForecastTitle: 'Lưu lượng sông dự báo {count} ngày tới',
  hideTable: 'Ẩn bảng số liệu',
  showTable: 'Xem bảng số liệu',
  pastDay: ' (đã qua)',
  floodAttribution:
    'Dữ liệu: GloFAS (Copernicus Emergency Management Service) qua Open-Meteo. Mức lũ được ước tính từ 20 năm dữ liệu. Thông tin tham khảo, hãy theo dõi bản tin chính thức của cơ quan khí tượng thủy văn.',

  // Skills
  skillsTitle: 'KỸ NĂNG ỨNG PHÓ THIÊN TAI',
  forYou: 'Dành cho bạn',
  thingsToDo: '{count} việc cần làm khi có {name}',
  relatedToAlert: '⚠️ Liên quan cảnh báo hiện tại',
  checklist: 'Danh sách kiểm tra',
  noInfo: 'Chưa có thông tin cho mục này.',
  openChecklist: 'Mở danh sách kiểm tra "{name}"',
  reset: 'Đặt lại',
  relatedTo: 'Liên quan: {title}',
  progress: 'Đã hoàn thành {done}/{total}',

  // Shelters
  official: 'Chính thức',
  distanceFromYou: 'Cách bạn {distance}',
  capacity: ' · Sức chứa {count} người',
  directionsTo: 'Chỉ đường đến {name}',
  directions: 'Chỉ đường',
  callPlace: 'Gọi {name}',
  findingShelters: 'Đang tìm nơi sơ tán gần bạn...',
  sheltersHint:
    'Trường học, nhà văn hóa, trụ sở UBND và bệnh viện thường được dùng làm nơi sơ tán. Luôn làm theo hướng dẫn của chính quyền địa phương.',
  noLocationSettings: 'Chưa có vị trí. Hãy chọn vị trí trong Cài đặt.',
  noShelters: 'Không tìm thấy nơi sơ tán trong bán kính 15 km.',
  mapAttribution: 'Dữ liệu bản đồ © OpenStreetMap contributors',

  // Emergency contacts
  contact115: 'Cấp cứu y tế',
  contact114: 'Cứu hỏa, cứu nạn cứu hộ',
  contact113: 'Công an',
  contact112: 'Tìm kiếm cứu nạn',
  contact111: 'Bảo vệ trẻ em',
  callNumberQ: 'Gọi {number}?',
  call: 'Gọi',
  contactA11y: '{name}, số {number}. Nhấn để gọi',
  slideToCall: 'Trượt để gọi >>>',
  emergencyFooter:
    'Các số khẩn cấp gọi miễn phí từ mọi điện thoại. Hãy nói rõ địa chỉ, tình trạng và số người cần hỗ trợ.',

  // Community feed
  category_flood: '🌊 Ngập lụt',
  category_landslide: '⛰️ Sạt lở',
  category_storm: '🌀 Bão, gió lớn',
  category_rescue: '🆘 Cần cứu trợ',
  category_other: '📢 Khác',
  water_none: 'Không ngập',
  water_ankle: 'Ngập mắt cá',
  water_knee: 'Ngập đầu gối',
  water_waist: 'Ngập ngang hông',
  water_chest: 'Ngập ngang ngực',
  water_over_head: 'Ngập quá đầu',
  reportPostTitle: 'Báo cáo bài viết',
  reportPostQuestion: 'Lý do báo cáo bài viết này?',
  reasonFalse: 'Thông tin sai',
  reasonAbuse: 'Nội dung xấu / spam',
  thanks: 'Cảm ơn bạn',
  reportedMessage: 'Bài viết đã được báo cáo và sẽ được kiểm tra.',
  hideAuthorQ: 'Ẩn bài của {name}?',
  hideAuthorMessage: 'Bạn sẽ không thấy bài viết của người này nữa. Có thể bỏ chặn trong Cài đặt.',
  hide: 'Ẩn',
  deletePostQ: 'Xóa bài viết?',
  deletePostMessage: 'Bài viết sẽ bị xóa vĩnh viễn.',
  yourPost: 'Bài viết của bạn',
  deletePost: 'Xóa bài viết',
  options: 'Tùy chọn',
  reportAbuse: 'Báo cáo vi phạm',
  hideThisAuthor: 'Ẩn bài của người này',
  postOptions: 'Tùy chọn bài viết',
  iSeeItToo: '👁 Tôi cũng thấy',
  sendRealAlert: 'GỬI CẢNH BÁO THỰC TẾ',
  realAlertsNearYou: 'Cảnh báo thực tế gần bạn',
  feedSubtitle: 'Trong bán kính 50 km, 7 ngày gần nhất. Tự động cập nhật mỗi phút.',
  noPosts: 'Chưa có báo cáo nào gần bạn. Hãy là người đầu tiên chia sẻ tình hình!',

  // New report
  communityRulesTitle: 'Quy tắc cộng đồng',
  communityRules:
    '• Chỉ chia sẻ thông tin thật, do bạn trực tiếp chứng kiến.\n' +
    '• Không đăng nội dung xúc phạm, quảng cáo, lừa đảo hoặc thông tin cá nhân của người khác.\n' +
    '• Bài viết, ảnh và vị trí bạn gửi sẽ được hiển thị công khai.\n' +
    '• Bài viết vi phạm sẽ bị ẩn hoặc xóa.\n' +
    '• Khi gặp nguy hiểm, hãy gọi 112 / 114 / 115 trước tiên.',
  agree: 'Tôi đồng ý',
  currentGps: 'Vị trí GPS hiện tại',
  locationFailed: 'Không lấy được vị trí',
  cannotOpen: 'Không thể mở',
  pleaseRetry: 'Vui lòng thử lại.',
  missingLocation: 'Thiếu vị trí',
  missingLocationMessage: 'Hãy cho phép truy cập vị trí hoặc chọn vị trí trước.',
  missingName: 'Thiếu tên',
  missingNameMessage: 'Hãy nhập tên hiển thị của bạn.',
  missingDescription: 'Thiếu mô tả',
  missingDescriptionMessage: 'Hãy mô tả ngắn gọn tình hình tại chỗ của bạn.',
  sent: 'Đã gửi',
  sentMessage: 'Cảm ơn bạn đã chia sẻ thông tin với cộng đồng!',
  sendFailed: 'Không gửi được',
  newReportTitle: 'Gửi cảnh báo thực tế',
  incidentType: 'Loại sự việc',
  waterLevel: 'Mức nước',
  description: 'Mô tả thông tin',
  descriptionPlaceholder: 'Ví dụ: Đường Nguyễn Hữu Cảnh ngập sâu, xe máy không đi được',
  location: 'Vị trí',
  useGps: 'Dùng GPS',
  displayName: 'Tên hiển thị',
  yourName: 'Tên của bạn',
  addPhoto: 'Thêm ảnh liên quan',
  removePhoto: '✕ Bỏ ảnh',
  takePhoto: 'Chụp ảnh',
  choosePhoto: 'Chọn ảnh',
  publicNote:
    'Bài viết, ảnh và vị trí sẽ hiển thị công khai. Ảnh được xóa thông tin GPS trước khi đăng.',
  submitReport: 'Gửi báo cáo',

  // Location picker
  chooseLocation: 'Chọn vị trí',
  useCurrentLocation: '📍 Dùng vị trí hiện tại (GPS)',
  searchPlaceholder: 'Tìm tỉnh, thành phố, phường xã...',
  searchResults: 'Kết quả tìm kiếm',
  bigCities: 'Thành phố lớn',
  noPlaces: 'Không tìm thấy địa điểm phù hợp.',

  // Settings
  deleteMyDataQ: 'Xóa dữ liệu của tôi?',
  deleteMyDataMessage:
    'Toàn bộ bài viết, ảnh và lượt xác nhận bạn đã gửi sẽ bị xóa khỏi máy chủ. Không thể hoàn tác.',
  deleted: 'Đã xóa',
  deletedPosts: 'Đã xóa {count} bài viết.',
  deleteFailed: 'Không xóa được',
  saved: 'Đã lưu',
  serverIs: 'Máy chủ: {url}',
  sectionLocation: 'Vị trí',
  manualLocationHint: 'Vị trí chọn thủ công · Nhấn để đổi',
  gpsLocationHint: 'Theo GPS · Nhấn để chọn vị trí khác',
  useGpsLocation: 'Dùng vị trí GPS',
  sectionNotifications: 'Thông báo',
  disasterAlerts: 'Cảnh báo thiên tai',
  disasterAlertsHint: 'Kiểm tra khoảng 30 phút một lần, kể cả khi đóng ứng dụng',
  checkNow: 'Kiểm tra cảnh báo ngay',
  checking: 'Đang kiểm tra',
  checkingMessage: 'Bạn sẽ nhận thông báo nếu có cảnh báo mới.',
  sectionCommunity: 'Cộng đồng',
  nicknameNotSet: 'Chưa đặt (đặt khi gửi bài)',
  unhideAll: 'Bỏ ẩn tất cả người dùng',
  hiddenCount: '{count} người đang bị ẩn',
  deleteMyData: 'Xóa dữ liệu của tôi',
  sectionLanguage: 'Ngôn ngữ / Language',
  sectionInfo: 'Thông tin',
  privacyPolicy: 'Chính sách quyền riêng tư',
  dataSources: 'Nguồn dữ liệu',
  dataSourcesList:
    'Thời tiết: Open-Meteo.com (CC BY 4.0)\n' +
    'Lũ sông: GloFAS - Copernicus Emergency Management Service\n' +
    'Thiên tai: GDACS (Liên Hợp Quốc & Ủy ban châu Âu)\n' +
    'Bản đồ, nơi sơ tán: © OpenStreetMap contributors',
  note: 'Lưu ý',
  disclaimer:
    'FloodShield là ứng dụng độc lập, không thuộc và không đại diện cho bất kỳ cơ quan nhà nước nào. Thông tin chỉ mang tính tham khảo. Luôn làm theo hướng dẫn của chính quyền và Trung tâm Dự báo KTTV Quốc gia (nchmf.gov.vn).',
  version: 'Phiên bản {version}',
  showAdvanced: 'Nhấn để hiện cài đặt nâng cao',
  apiServer: 'Máy chủ API',

  // Dates
  longDate: 'Ngày {day} tháng {month} năm {year}',
  justNow: 'Vừa xong',
  minutesAgo: '{count} phút trước',
  hoursAgo: '{count} giờ trước',
  daysAgo: '{count} ngày trước',
};

export default vi;
