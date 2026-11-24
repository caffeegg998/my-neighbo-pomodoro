import type { Language } from './types';

const en = {
  appName: 'My Neighbor Pomodoro', tagline: 'Make room for focus', workspace: 'Workspace', yourDay: 'Your day', navigation: 'Main navigation', focus: 'Focus', tasks: 'Tasks', stats: 'Statistics', settings: 'Settings',
  today: 'Today', thisWeek: 'This week', minutes: 'min', sessions: 'sessions', session: 'session',
  weekView: 'Weekly view', chooseDate: 'Choose date', weekNavigation: 'Chart weeks', previousWeek: 'Previous week', nextWeek: 'Next week',
  focusSpace: 'Your focus space', focusSubtitle: 'One thing at a time. The rest can wait.',
  shortBreak: 'Short break', longBreak: 'Long break', ready: 'Ready when you are', running: 'Stay with it', paused: 'Paused', finished: 'Session complete',
  startFocus: 'Start focus', startBreak: 'Start break', pause: 'Pause', resume: 'Resume', skip: 'Skip', reset: 'Reset',
  upNext: 'Up next', chooseTask: 'Choose a task', noTask: 'No task selected',
  todayPlan: "Today's plan", viewAll: 'View all', addTask: 'Add a task', taskPlaceholder: 'What will you work on?', noTasks: 'A clear space to begin.',
  taskList: 'Your tasks', taskListSubtitle: 'Keep the next step simple and visible.', openTasks: 'To do', doneTasks: 'Completed',
  edit: 'Edit', delete: 'Delete', save: 'Save', cancel: 'Cancel', deleteConfirm: 'Delete this task?',
  insights: 'A little progress adds up.', focusTime: 'Focus time', completedSessions: 'Completed sessions', dailyFocus: 'Focus minutes by day',
  noSessions: 'Complete a focus session to see your progress here.', noWeekSessions: 'No focus sessions in this week', chooseAnotherWeek: 'Choose another date to view its week.', recentSessions: 'Recent sessions', last30Days: 'Last 30 days', recentPages: 'Recent session pages', page: 'Page', previousPage: 'Previous', nextPage: 'Next',
  preferences: 'Make it yours.', timerSettings: 'Timer', focusDuration: 'Focus duration', shortBreakDuration: 'Short break duration',
  longBreakDuration: 'Long break duration', longBreakEvery: 'Long break after', cycles: 'focus sessions',
  appearance: 'Appearance & language', language: 'Language', followSystem: 'Follow system', english: 'English', vietnamese: 'Tiếng Việt',
  theme: 'Theme', light: 'Light', dark: 'Dark', sound: 'Sound when a session ends', saveSettings: 'Save preferences', saved: 'Preferences saved',
  testMode: 'Test mode', testModeHint: 'Start a session, then use Next session to finish it instantly. Focus sessions count in statistics for their full configured duration.', nextTestSession: 'Next session', testModeRequiresUpdate: 'Restart the updated app to use Test mode.',
  timerStyle: 'Timer style', timerStyleHint: 'Choose how the focus timer looks.', travel: 'Travel', travelDescription: 'A journey around the world as you focus', classic: 'Classic', classicDescription: 'The original clean timer', amply: 'Amply', amplyDescription: 'A guitar amp with the clock in its speaker', strumGuitar: 'Strum guitar', drum: 'Drum', drumDescription: 'Play the kit by clicking or using F, G, B, H, J, T, Y',
  drumCrash: 'Crash cymbal', drumLeftTom: 'Left tom', drumRightTom: 'Right tom', drumFloorTom: 'Floor tom', drumKick: 'Kick drum', drumSnare: 'Snare drum', drumHiHat: 'Hi-hat',
  timerSize: 'Overall size', clockSize: 'Clock digits size', styleSizeHint: 'Each style keeps its own size settings.', smaller: 'Smaller', larger: 'Larger',
  localOnly: 'Your data stays on this device.', closeHint: 'Closing the window keeps the timer running in the tray.',
  updates: 'App updates', updatesHint: 'Get the latest version of My Neighbor Pomodoro.', currentVersion: 'Current version',
  checkForUpdates: 'Check for updates', checkingUpdates: 'Checking for updates…', upToDate: 'You are up to date.',
  updateAvailable: 'Version {version} is available', installUpdate: 'Download and install', downloadingUpdate: 'Downloading update', installingUpdate: 'Installing update. The app will restart.',
  updateCheckFailed: 'Could not check for updates. Please try again.', updateInstallFailed: 'Could not install the update. Please try again.',
  finishSessionBeforeUpdate: 'Finish the current session before installing.', updatesDesktopOnly: 'Updates are available in the desktop app.',
  statusBar: 'Status bar', localStatus: 'Local',
  error: 'Something went wrong. Please try again.', startNext: 'Start the next session when you are ready.',
  noStats: 'No focus sessions yet', focusSessions: 'Focus sessions',
} as const;

const vi: Record<keyof typeof en, string> = {
  appName: 'My Neighbor Pomodoro', tagline: 'Dành chỗ cho sự tập trung', workspace: 'Không gian làm việc', yourDay: 'Ngày của bạn', navigation: 'Điều hướng chính', focus: 'Tập trung', tasks: 'Công việc', stats: 'Thống kê', settings: 'Cài đặt',
  today: 'Hôm nay', thisWeek: 'Tuần này', minutes: 'phút', sessions: 'phiên', session: 'phiên',
  weekView: 'Xem theo tuần', chooseDate: 'Chọn ngày', weekNavigation: 'Chuyển tuần biểu đồ', previousWeek: 'Tuần trước', nextWeek: 'Tuần sau',
  focusSpace: 'Không gian tập trung', focusSubtitle: 'Từng việc một. Những việc khác có thể đợi.',
  shortBreak: 'Nghỉ ngắn', longBreak: 'Nghỉ dài', ready: 'Sẵn sàng khi bạn muốn', running: 'Giữ nhịp tập trung', paused: 'Đã tạm dừng', finished: 'Phiên đã hoàn thành',
  startFocus: 'Bắt đầu tập trung', startBreak: 'Bắt đầu nghỉ', pause: 'Tạm dừng', resume: 'Tiếp tục', skip: 'Bỏ qua', reset: 'Đặt lại',
  upNext: 'Tiếp theo', chooseTask: 'Chọn công việc', noTask: 'Chưa chọn công việc',
  todayPlan: 'Kế hoạch hôm nay', viewAll: 'Xem tất cả', addTask: 'Thêm công việc', taskPlaceholder: 'Bạn sẽ làm việc gì?', noTasks: 'Một khoảng trống để bắt đầu.',
  taskList: 'Công việc của bạn', taskListSubtitle: 'Giữ bước tiếp theo đơn giản và rõ ràng.', openTasks: 'Cần làm', doneTasks: 'Đã xong',
  edit: 'Sửa', delete: 'Xóa', save: 'Lưu', cancel: 'Hủy', deleteConfirm: 'Xóa công việc này?',
  insights: 'Từng chút tiến bộ sẽ tạo khác biệt.', focusTime: 'Thời gian tập trung', completedSessions: 'Phiên hoàn thành', dailyFocus: 'Số phút tập trung mỗi ngày',
  noSessions: 'Hoàn thành một phiên tập trung để xem tiến độ ở đây.', noWeekSessions: 'Không có phiên tập trung trong tuần đã chọn', chooseAnotherWeek: 'Chọn ngày khác trên lịch để xem tuần đó.', recentSessions: 'Các phiên gần đây', last30Days: '30 ngày gần đây', recentPages: 'Phân trang các phiên gần đây', page: 'Trang', previousPage: 'Trước', nextPage: 'Sau',
  preferences: 'Điều chỉnh theo ý bạn.', timerSettings: 'Bộ đếm', focusDuration: 'Thời gian tập trung', shortBreakDuration: 'Thời gian nghỉ ngắn',
  longBreakDuration: 'Thời gian nghỉ dài', longBreakEvery: 'Nghỉ dài sau', cycles: 'phiên tập trung',
  appearance: 'Giao diện và ngôn ngữ', language: 'Ngôn ngữ', followSystem: 'Theo hệ thống', english: 'English', vietnamese: 'Tiếng Việt',
  theme: 'Giao diện', light: 'Sáng', dark: 'Tối', sound: 'Phát âm thanh khi hết phiên', saveSettings: 'Lưu cài đặt', saved: 'Đã lưu cài đặt',
  testMode: 'Chế độ thử nghiệm', testModeHint: 'Bắt đầu phiên rồi bấm Chuyển phiên ngay để hoàn thành tức thì. Phiên Tập trung được cộng vào Thống kê theo toàn bộ thời lượng đã cài.', nextTestSession: 'Chuyển phiên ngay', testModeRequiresUpdate: 'Hãy mở lại bản ứng dụng mới để dùng Chế độ thử nghiệm.',
  timerStyle: 'Kiểu bộ đếm', timerStyleHint: 'Chọn giao diện cho đồng hồ tập trung.', travel: 'Du lịch', travelDescription: 'Vòng quanh thế giới trong lúc tập trung', classic: 'Cổ điển', classicDescription: 'Đồng hồ tối giản ban đầu', amply: 'Amply', amplyDescription: 'Đồng hồ nằm giữa loa của amply đàn', strumGuitar: 'Gảy đàn', drum: 'Trống', drumDescription: 'Chơi trống bằng cách bấm hoặc dùng phím F, G, B, H, J, T, Y',
  drumCrash: 'Chũm chọe crash', drumLeftTom: 'Trống tom trái', drumRightTom: 'Trống tom phải', drumFloorTom: 'Trống tom sàn', drumKick: 'Trống bass', drumSnare: 'Trống snare', drumHiHat: 'Chũm chọe hi-hat',
  timerSize: 'Kích thước tổng thể', clockSize: 'Kích thước số đếm', styleSizeHint: 'Mỗi kiểu lưu kích thước riêng.', smaller: 'Nhỏ hơn', larger: 'Lớn hơn',
  localOnly: 'Dữ liệu chỉ được lưu trên thiết bị này.', closeHint: 'Đóng cửa sổ, bộ đếm vẫn chạy trong khay hệ thống.',
  updates: 'Cập nhật ứng dụng', updatesHint: 'Cài phiên bản My Neighbor Pomodoro mới nhất.', currentVersion: 'Phiên bản hiện tại',
  checkForUpdates: 'Kiểm tra cập nhật', checkingUpdates: 'Đang kiểm tra cập nhật…', upToDate: 'Bạn đang dùng phiên bản mới nhất.',
  updateAvailable: 'Đã có phiên bản {version}', installUpdate: 'Tải và cài đặt', downloadingUpdate: 'Đang tải bản cập nhật', installingUpdate: 'Đang cài đặt. Ứng dụng sẽ khởi động lại.',
  updateCheckFailed: 'Không thể kiểm tra cập nhật. Vui lòng thử lại.', updateInstallFailed: 'Không thể cài bản cập nhật. Vui lòng thử lại.',
  finishSessionBeforeUpdate: 'Hãy hoàn thành phiên hiện tại trước khi cài đặt.', updatesDesktopOnly: 'Chỉ ứng dụng máy tính mới hỗ trợ cập nhật.',
  statusBar: 'Thanh trạng thái', localStatus: 'Cục bộ',
  error: 'Đã xảy ra lỗi. Vui lòng thử lại.', startNext: 'Bắt đầu phiên tiếp theo khi bạn sẵn sàng.',
  noStats: 'Chưa có phiên tập trung', focusSessions: 'Phiên tập trung',
};

export type TranslationKey = keyof typeof en;
export function strings(language: Language): Record<TranslationKey, string> {
  return language === 'vi' ? vi : en;
}

export function effectiveLanguage(preference: Language | ''): Language {
  if (preference) return preference;
  return navigator.language.toLowerCase().startsWith('vi') ? 'vi' : 'en';
}
