# Noted Web — React + Vite + TypeScript

Frontend của ứng dụng ghi chú **Noted**, theo hướng **local-first**: mở ra là dùng được ngay,
không cần đăng nhập. Chỉ khi người dùng bấm "Đăng nhập & Đồng bộ" mới cần tài khoản Google.

> Đây là nửa **frontend**. Nửa **backend** (Java 17 + Spring Boot 3.3) nằm ở thư mục cùng cấp
> [`../api`](../api/README.md). Hai thư mục là **một sản phẩm duy nhất**. Chi tiết phía server
> (API endpoints, Debounce Sync lên Drive, refresh token rotation, OCC theo `version`) chỉ viết ở
> README của api, file này không lặp lại.

## 1. Kiến trúc local-first (Local Mode ↔ Server Mode)

```
Mở app lần đầu (chưa đăng nhập)
        │
        ▼
  LOCAL MODE: note lưu hoàn toàn trong IndexedDB của trình duyệt
  (utils/localNotesStore.ts). Dùng đủ mọi tính năng, không cần mạng.
        │
        │  bấm "Đăng nhập & Đồng bộ" (authApi.loginWithGoogle)
        ▼
  Đăng nhập Google (OAuth2, callback về domain backend)
        │
        │  backend chuyển về /oauth/callback → migrateLocalNotesToServer()
        │  (dùng lại POST /api/sync/batch, không có endpoint riêng cho migration)
        ▼
  SERVER MODE: note nằm trên backend (MySQL + file trên đĩa), dùng chung
  giữa nhiều thiết bị. Google Drive là lớp sao lưu RIÊNG, tùy chọn, kết nối
  ở bước khác (bảng Drive), không gắn với việc đăng nhập.
```

`App.tsx` render `Workspace` ngay lập tức bất kể trạng thái đăng nhập, không có màn hình chờ
"đang kiểm tra đăng nhập" chặn trước giao diện chính.

Không dùng react-router: `App.tsx` tự kiểm tra `window.location.pathname` cho 2 route đặc biệt
`/oauth/callback` (nhận token sau khi đăng nhập) và `/drive/callback` (sau khi kết nối Drive).

## 2. Cấu trúc thư mục

```
src/
  main.tsx              ← entrypoint, mount App vào #root, import index.css
  App.tsx               ← App → AuthGate → Workspace (tách component để không early-return
                           giữa chừng một component đã gọi hook - Rules of Hooks)
  api/                  ← 1 file ứng với 1 controller backend, chỉ gọi API, không có logic UI
    notesRepo.ts          interface che đi Local Mode/Server Mode cho các hook
    authApi.ts, driveApi.ts, notesApi.ts, syncApi.ts, types.ts
  hooks/                ← toàn bộ state/business logic UI
    useAuth.ts            trạng thái đăng nhập (checking/authenticated/unauthenticated)
    useNotes.ts           CRUD note, tự chọn Local/Server repo
    useAutoSave.ts        debounce 1.3s rồi lưu, hiển thị trạng thái "Đã lưu"
    useDriveSync.ts       trạng thái kết nối/đồng bộ Drive, tự gọi sync-all 2.5s sau khi lưu
    useOfflineSync.ts     nghe online/offline, flush hàng đợi khi có mạng lại, thử lại mỗi 30s
                          (CHỈ 1 instance ở Workspace - side-effect toàn cục)
    useNoteSort.ts, useSelectMode.ts, useRename.ts, useSidebarResize.ts
  components/           ← layout/ (EditorPane dùng CodeMirror 6, TopBar, StatusBar),
                          sidebar/, modals/ (DrivePanel, Rename, Delete...), auth/
  utils/                ← apiClient.ts (fetch wrapper + tự refresh token), authToken.ts,
                          localNotesStore.ts (IndexedDB), offlineQueue.ts, localBackup.ts,
                          migrateLocalNotes.ts, session.ts, timeAgo.ts, uniqueName.ts
  collab/               ← soạn thảo cộng tác: collabProtocol.ts (mã message/mã đóng, khớp backend
                          YjsProtocol), useCollabDocument.ts (Y.Doc + IndexedDB + WebSocket),
                          crossDeviceUndo.ts (Ctrl+Z/Ctrl+Y theo user trên mọi thiết bị),
                          externalMerge.ts (hợp nhất 3 chiều nội dung từ Drive/REST)
  config/env.ts         ← nơi DUY NHẤT đọc import.meta.env.VITE_*
```

## 3. Các cơ chế quan trọng

- **Soạn thảo cộng tác thời gian thực (Server Mode)** — `src/collab/`:
  - `useCollabDocument.ts` mở một `Y.Doc` cho note đang active. Note được dùng chế độ này khi có
    `yjsGeneration` từ backend.
    - `y-indexeddb` (database `noted-yjs-u{user}-n{note}-g{đời}`) ghi mọi thay đổi xuống ổ cứng
      trình duyệt ngay lập tức, nên mất mạng vẫn gõ được.
    - `y-websocket` kết nối `/ws/notes/{id}?generation=N`. Access token gửi qua
      `Sec-WebSocket-Protocol`, không đặt trong URL. Khi có mạng, hai bên trao đổi state vector để
      gửi bù đúng phần thiếu, rồi hợp nhất không xung đột.
  - `EditorPane` gắn CodeMirror vào `Y.Text("content")` bằng `yCollab` (`y-codemirror.next`):
    hiện con trỏ và tên của thiết bị khác.
  - **Ctrl+Z / Ctrl+Y theo user, không theo thiết bị** (`crossDeviceUndo.ts`, dùng `Y.UndoManager`).
    Cùng một user đăng nhập nhiều nơi thì Ctrl+Z ở máy nào cũng gỡ được chữ user đó vừa gõ, kể cả
    chữ gõ ở máy/tab khác.
    - Chữ của user **khác** thì không gỡ: so `clientID` người gõ với `user.id` trong awareness.
    - Dữ liệu nạp lúc mở note (IndexedDB, log server phát lại) **không** vào lịch sử hoàn tác. Nếu
      vào, Ctrl+Z trên thiết bị mới sẽ xóa sạch note. Mốc "đã nạp xong" là lúc server gửi step1 rỗng.
    - Vì vậy chữ máy khác gõ **trong lúc máy này mất mạng** cũng không hoàn tác được ở máy này. Chỉ
      thay đổi đến trực tiếp khi đang kết nối mới hoàn tác được.
    - Chữ hai máy gõ sát nhau được tách thành các bước Ctrl+Z riêng.
    - Giới hạn: Yjs không ghi lại ai đã **xóa**, nên phần xóa ở máy khác luôn được nhận là của user
      này. Hiện đúng vì backend chỉ cho chủ note vào phòng; khi có chia sẻ note phải siết lại.
  - Mỗi phím gõ đi qua WebSocket, **không** qua REST. Sau 1.5s ngừng gõ, client gửi ảnh chụp text
    (message `100`). Backend ghi file `.txt` rồi đẩy lên Drive như cũ. Khi nhận ack (`101`) thì hiện
    "Đã lưu". Chưa nhận được ack thì cờ được giữ trong localStorage và gửi lại sau khi kết nối và
    đồng bộ xong.
  - Mã đóng kết nối:
    - `4401`: refresh token rồi kết nối lại.
    - `4409`: đời tài liệu trên server khác. Client tải lại note theo đời mới; hiện backend không còn
      đường nào đổi đời.
    - `4404`/`4410`: gỡ note khỏi danh sách.
  - **Nội dung từ ngoài luôn được gộp vào 1 file, không tạo bản sao** (`externalMerge.ts`). Các nguồn
    đó là Drive, REST, hàng đợi offline, ghi đè khi trùng tên.
    - Server gửi (message `102`) cho đúng 1 trình duyệt hai bản: bản gốc và bản mới. Trình duyệt hợp
      nhất 3 chiều chúng với nội dung đang soạn: diff3 theo dòng, sau đó theo ký tự cho các dòng liền kề.
    - Đoạn bị sửa chồng lên cùng chỗ thì giữ cả 2 bản ngay trong file, kẹp giữa `<<<<<<< Đang soạn` /
      `=======` / `>>>>>>> Google Drive`, và hiện banner báo cho người dùng.
    - `mergeId` lưu trong `Y.Map("noted-meta")` để không áp 2 lần. Bản hợp nhất không nằm trong lịch sử
      Ctrl+Z, vì đó không phải chữ user gõ.
  - Note ở Local Mode vẫn chạy như cũ: `useAutoSave` + IndexedDB `localNotesStore`, không dùng Yjs.
- **Nhiều trình duyệt cùng sửa một note — chỉ áp dụng cho note KHÔNG dùng Yjs** (`App.tsx`):
  note cộng tác bỏ qua cơ chế này vì thay đổi đã tự chảy vào qua WebSocket. Khi quay lại tab (`focus`/
  `visibilitychange`), app so `Note.contentVersion` với `version` trên server.
  - Server mới hơn và không có chữ chưa lưu → kéo nội dung mới về, không hỏi.
  - Server mới hơn nhưng đang có chữ chưa lưu → hiện thanh hỏi "Giữ bản của tôi / Tải lại bản mới".

  `contentVersion` khác `version`: `version` được nâng theo server mà không tải nội dung, còn
  `contentVersion` chỉ đổi khi nội dung đang hiển thị thật sự được tải về hoặc vừa lưu xong.
  Cơ chế này là điều kiện để backend được phép **ghi đè** ở `/api/sync/batch` (xem README api, mục 8).
- **Hàng đợi offline** (`useOfflineSync.ts`): `synced_overwritten` nghĩa là hàng đợi vừa ghi đè
  lên bản mới hơn trên server, nên client kéo lại nội dung. `conflict_kept_both` vẫn được xử lý
  để tương thích ngược, nhưng backend hiện không còn trả status này.
- **Flush lên Drive khi đóng tab**: `pagehide`/`visibilitychange` gọi `POST /api/drive/sync-all`
  bằng `fetch(..., { keepalive: true })`. Có cảnh báo trước khi thoát nếu còn note chưa lên Drive.
- **Gợi ý bật Drive** sau khi đăng nhập (góc dưới phải). Chọn "Để sau" thì lưu vào localStorage,
  lần sau không hỏi lại.
- **Responsive**: dưới 768px sidebar thành ngăn kéo phủ lên editor, mặc định đóng. Ngoài ra có
  mốc 900px và 480px.
- **Giao diện**: mặc định theme tối (nhớ lựa chọn của người dùng), tab file kiểu Chrome.

## 4. Quy ước cố định (đừng phá khi sửa code)

- **`Note.id` luôn là `number`** (khớp `Long id` phía backend). ID sinh ở Local Mode dùng
  `Date.now() * 1000 + counter`, **không dùng UUID string**.
- Hook gọi `notesRepo.xxx()` qua interface `NotesRepo`, **không tự biết** đang ở Local hay Server
  Mode. Phần rẽ nhánh nằm trong implementation của repo.
- `apiClient.ts` có **single-flight refresh**: nhiều request cùng bị 401 thì chỉ gọi
  `/api/auth/refresh` **một lần**. Gọi nhiều lần sẽ làm refresh token bị rotate chồng nhau và
  backend coi là token bị dùng lại → đăng xuất mọi thiết bị.
- Editor là CodeMirror nhưng `textareaRef` vẫn được gán một object có `focus()`, để
  `useNotes.ts` không phải biết bên trong là gì.
- Trước khi coi một thay đổi là "xong": chạy `npx tsc --noEmit` và thử thật trên trình duyệt.

## 5. Biến môi trường

Chỉ có 2 file: `.env` (giá trị thật, **gitignored**) và `.env.example` (mẫu, được commit).

| Biến | Dùng lúc | Ý nghĩa |
|---|---|---|
| `VITE_API_BASE_URL` | **build** (Vite ghi cứng vào bundle) | URL backend. Dev: `http://localhost:8210`. Rỗng = gọi đường dẫn tương đối `/api/...` qua nginx proxy |
| `BACKEND_HOST`, `BACKEND_PORT` | container khởi động | Nơi nginx proxy `/api/`, `/oauth2/`, `/login/oauth2/` tới. Mặc định `noted-api:8210` |
| `WEB_PORT` | container khởi động | Cổng nginx lắng nghe, mặc định `8200` |
| `PROJECT_NAME`, `PROJECT_CODE` | quy chuẩn deploy | `noted`, `82` |

Vì `VITE_API_BASE_URL` được ghi cứng lúc build, đổi giá trị này thì phải **build lại image**.

## 6. Chạy local (dev)

```bash
pnpm install
pnpm dev            # Vite ở cổng 8445 (vite.config.ts: process.env.PORT || 8445)
```

- Backend chạy ở `http://localhost:8210` (xem [README api, mục 10](../api/README.md)). Backend
  chưa chạy thì app vẫn dùng được ở **Local Mode**, chỉ nút "Đăng nhập & Đồng bộ" bị lỗi.
- Đổi cổng dev (`PORT=xxxx pnpm dev`) thì phải sửa theo trong `.env` của api:
  `ALLOWED_ORIGINS`, `FRONTEND_REDIRECT_URL`, `DRIVE_FRONTEND_CALLBACK_URL`. Lệch là lỗi CORS
  hoặc redirect sai khi đăng nhập Google.

```bash
pnpm build          # build production ra dist/
pnpm preview        # xem thử bản build
pnpm format         # oxfmt
npx tsc --noEmit    # type-check
```

## 7. Deploy (quy chuẩn mã 82: web 8200, api 8210)

```bash
# 1. Chạy api TRƯỚC: compose của api tạo network noted-net
cd ../api && docker compose up -d --build
# 2. Rồi tới web (noted-net khai báo external)
cd ../web && docker compose up -d --build
```

Dockerfile build 2 stage: `node:20-alpine` chạy `pnpm build`, rồi `nginx-unprivileged:1.27-alpine`
phục vụ `dist/` ở cổng 8200 (chỉ bind `127.0.0.1`).

**Production qua Cloudflare Tunnel:**

```
noted.thongtinchinhhieu.site      → http://localhost:8200   (noted-web)
noted-api.thongtinchinhhieu.site  → http://localhost:8210   (noted-api)
```

Từ 2026-10-18, web **gọi thẳng** backend qua `https://noted-api.thongtinchinhhieu.site`. Đây là
giá trị mặc định của build arg trong `docker-compose.yml`, đặt `VITE_API_BASE_URL` khi build để
ghi đè. Hệ quả:

- Web và api khác origin, nên backend phải bật CORS có credentials với
  `ALLOWED_ORIGINS=https://noted.thongtinchinhhieu.site` và `REFRESH_COOKIE_SECURE=true`.
- Hai domain cùng site `thongtinchinhhieu.site` nên cookie `refresh_token` vẫn được gửi.
- Callback của Google trỏ vào domain **api** (xem `.env.example` của api).

Cấu hình proxy trong `nginx/default.conf.template` **vẫn giữ** cho trường hợp build với
`VITE_API_BASE_URL=""` (cùng origin, không cần CORS). Template này đã xử lý 2 bẫy khi nằm sau
Cloudflare Tunnel: lấy `X-Forwarded-Proto` thật của client (tránh `redirect_uri` bị thành `http`),
và tắt `absolute_redirect`/`port_in_redirect` (tránh redirect lộ cổng nội bộ 8200).

## 8. Trạng thái hiện tại

- Gọi đủ **20/20 endpoint** của backend. Mỗi hàm trong `src/api/*.ts` có comment ghi
  `METHOD /api/path` tương ứng.
- `authApi.logoutAllDevices()` (`POST /api/auth/logout-all`) đã có nhưng **chưa có nút nào gọi**.
- Chưa có test tự động (unit/e2e). Hiện chỉ kiểm bằng `tsc --noEmit` và thử tay trên trình duyệt.
- CodeMirror mới thay nền cho `<textarea>`, **chưa** tô màu cú pháp. Bundle: 238 KB → 513 KB khi
  thêm CodeMirror, → 624 KB (gzip 198 KB) khi thêm Yjs/y-websocket/y-indexeddb.
- Soạn thảo cộng tác **chưa được thử với backend thật**. Đã kiểm: `tsc`, `pnpm build`, Local Mode
  trên trình duyệt (gõ, tự lưu, Ctrl+Z, tải lại trang), và mô phỏng relay bằng client y-websocket
  thật. Còn phải thử trên staging: 2 trình duyệt cùng note, rút mạng rồi cắm lại, token hết hạn
  (4401), kéo từ Drive (4409).
- Chưa chia sẻ note giữa nhiều người dùng; phòng chỉ mở cho chủ note.
- `site.config.json` còn mô tả của template cũ ("travel photo albums") chưa thay.
