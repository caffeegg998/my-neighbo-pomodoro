# Cập nhật ứng dụng

Trong **Settings → App updates**, chọn **Check for updates**. Khi có phiên bản mới, chọn **Download and install**. Hãy hoàn thành phiên đang chạy trước khi cài đặt. Trên macOS ứng dụng khởi động lại sau khi cài; trên Windows trình cài đặt đóng ứng dụng và hoàn tất cập nhật.

Ứng dụng lấy thông tin từ `latest.json` của [bản phát hành ổn định mới nhất](https://github.com/caffeegg998/my-neighbo-pomodoro/releases/latest). Mỗi gói cập nhật được xác thực bằng chữ ký trước khi cài. Bản thử nghiệm (prerelease) không được đề xuất làm bản cập nhật tự động.

## Thiết lập một lần cho người phát hành

Khóa ký cập nhật đã được tạo trong `.local-secrets/updater.key` trên máy phát triển và khóa công khai đã được cấu hình trong ứng dụng. **Sao lưu khóa riêng ở nơi an toàn**; nếu mất khóa, các bản đang cài không thể xác thực bản cập nhật được ký bằng khóa khác. Thư mục `.local-secrets` đã được đưa vào `.gitignore`; không commit hay chia sẻ khóa riêng.

Từ thư mục dự án, sau khi đăng nhập `gh`, đưa khóa riêng vào GitHub Actions secret:

```sh
gh secret set TAURI_SIGNING_PRIVATE_KEY < .local-secrets/updater.key
```

Lệnh này phải chạy trên máy có tệp khóa. Workflow sẽ từ chối tạo release nếu secret chưa được thiết lập.

## Phát hành phiên bản mới

1. Sửa cùng một số phiên bản trong `package.json`, `package-lock.json`, `src-tauri/Cargo.toml` và `src-tauri/tauri.conf.json`, theo SemVer, ví dụ `0.2.1`.
2. Chạy `npm test`, `npm run build`, `cargo check --locked` trong `src-tauri`, rồi commit và đẩy lên `main`.
3. Tạo tag khớp chính xác với phiên bản ứng dụng và đẩy tag:

   ```sh
   git tag v0.2.1
   git push origin main
   git push origin v0.2.1
   ```

GitHub Actions tạo DMG cho Mac Apple Silicon, EXE/MSI cho Windows x64, hai gói cập nhật có chữ ký và `latest.json`, sau đó xuất bản GitHub Release. Kiểm tra trạng thái workflow và tải thử bản cài từ trang Releases. Với bản thử nghiệm, dùng phiên bản/tag có hậu tố giống nhau, ví dụ `0.2.1-rc.1` và `v0.2.1-rc.1`; bản này sẽ là prerelease.

**Chuyển tiếp từ v0.1.0:** Bản cũ chưa có chức năng cập nhật, nên người dùng cần cài thủ công v0.2.0 một lần. Từ đó, các bản ổn định mới hơn có thể được cài ngay trong ứng dụng.
