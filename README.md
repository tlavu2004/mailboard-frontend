# MailBoard v1.0.0 - Modern Frontend Interface

MailBoard Frontend is a state-of-the-art email management interface built with **Next.js 16**, **React 19**, **TypeScript**, and **Ant Design 5**. It provides a seamless, high-performance experience for managing emails, organizing them on a **Kanban Board**, and leveraging **AI-powered search and summarization**.

> [!IMPORTANT]
> This is the **Frontend** repository. It requires the [MailBoard Backend](https://github.com/tlavu2004/mailboard-backend) to be running to function correctly.

---

## Key Features

### Premium Unified Layout
A stable, modern architecture designed for focus and productivity:
- **Consistent Sidebar**: A single vertical navigation hub containing the Logo, Compose button, Mailbox navigation, View Switcher (List/Kanban), and User Profile.
- **Adaptive Header**: Minimalist top bar that adapts to context (Search, Folder name) and displays real-time sync status.
- **Glassmorphism & Micro-animations**: Premium visual effects including smooth transitions, hover states, and loading skeletons.

### Dual Interaction Modes
Switch seamlessly between traditional and agile email management:
- **Classic List View**: Professional 3-column layout (Sidebar → Email List → Email Detail) with advanced sorting (Date, Sender, Subject), filtering (Unread, Attachments), and pagination.
- **Agile Kanban Board**: Full-featured drag-and-drop triage. Map Kanban columns directly to Gmail labels for bidirectional synchronization.

### Smart Reading & Reading Pane
A refined email consumption experience:
- **Vertical Split View**: Read emails side-by-side with your inbox list for maximum efficiency.
- **AI Triage & Summaries**: Instant AI-generated summaries on the detail card to save time, with an extractive fallback.
- **Contextual Actions**: Reply, Forward, Star, Snooze, and Delete directly from the reading pane.
- **Enhanced HTML Rendering**: Robust iframe-based rendering with custom CSS to fix LinkedIn and other common email template display issues.

### Professional Bulk Operations
Efficiently manage large volumes of mail:
- **Selection Management**: Multi-select emails using checkboxes or "Select All" functionality.
- **Bulk Cleanup**: Restore all emails from Trash to their original folders with one click.
- **Real-time Sync**: Actions are instantly reflected via WebSocket notifications without page refreshes.

### Intelligence & Search
- **Dual-Mode Search**: Toggle between traditional keyword search and conceptual **Semantic Search**.
- **Smart Suggestions**: Predictive dropdown as you type, pulling from your contacts and recently indexed subjects.

---

## Visual Showcase (Screenshots)

![Main Dashboard](https://via.placeholder.com/1200x600?text=MailBoard+Main+Dashboard)
*Note: [Insert screenshot_dashboard.png here]*

![Kanban Board](https://via.placeholder.com/1200x600?text=Kanban+Board+View)
*Note: [Insert screenshot_kanban.png here]*

![AI Summary](https://via.placeholder.com/1200x600?text=AI+Summarization+Feature)
*Note: [Insert screenshot_ai_summary.png here]*

![Search & Suggestions](https://via.placeholder.com/1200x600?text=Search+and+Auto-suggestions)
*Note: [Insert screenshot_search.png here]*

---

## Tech Stack

| Category | Technology |
| :--- | :--- |
| **Framework** | [Next.js 16](https://nextjs.org/) (App Router) |
| **UI Library** | [React 19](https://react.dev/) |
| **Language** | [TypeScript](https://www.typescriptlang.org/) |
| **Component Library** | [Ant Design 5](https://ant.design/) |
| **Styling** | [Tailwind CSS 4](https://tailwindcss.com/) + Vanilla CSS |
| **Drag & Drop** | [@dnd-kit](https://dndkit.com/) (core + sortable) |
| **Icons** | [Ant Design Icons](https://ant.design/components/icon) + [Lucide React](https://lucide.dev/) |
| **HTTP Client** | [Axios](https://axios-http.com/) (with request/response interceptors) |
| **Date Handling** | [Day.js](https://day.js.org/) |
| **State Management** | React Context API |
| **Routing** | Next.js App Router |

---

## Project Structure

```
mailboard-frontend/
├── src/
│   ├── app/
│   │   ├── layout.tsx           # Root layout with providers (Auth, Ant Design, Google OAuth)
│   │   ├── page.tsx             # Home page (redirects to /inbox)
│   │   ├── login/page.tsx       # Google OAuth login page
│   │   ├── auth/callback/       # OAuth callback handler
│   │   ├── inbox/
│   │   │   ├── page.tsx         # Main dashboard (Sidebar + List/Kanban + Detail)
│   │   │   └── inbox.css        # Dashboard layout styles
│   │   ├── statistics/page.tsx  # Email statistics dashboard
│   │   └── ~offline/page.tsx    # PWA offline fallback page
│   ├── components/
│   │   ├── ComposeModal.tsx     # Full email composition (604 lines, 21KB)
│   │   ├── ProtectedRoute.tsx   # Authentication route guard
│   │   ├── OfflineIndicator.tsx # Offline status banner
│   │   ├── PWARegister.tsx      # Service worker registration
│   │   └── statistics/          # Statistics visualization components
│   ├── contexts/
│   │   └── AuthContext.tsx      # Authentication state, login/logout, multi-tab sync
│   ├── hooks/
│   │   ├── useEmailNotifications.ts  # WebSocket real-time notifications
│   │   ├── useKeyboardShortcuts.ts   # Keyboard navigation hotkeys
│   │   └── useOnlineStatus.ts        # Online/offline detection
│   ├── services/
│   │   ├── api.ts               # Axios client with JWT interceptors & auto-refresh
│   │   ├── auth.ts              # Authentication API (login, refresh, logout)
│   │   ├── email.ts             # Email CRUD, sync, search, attachments
│   │   ├── kanbanService.ts     # Kanban column CRUD, email status updates
│   │   ├── searchService.ts     # Fuzzy, semantic search & suggestions
│   │   └── statisticsService.ts # Email statistics API
│   ├── types/
│   │   ├── auth.ts              # Auth type definitions
│   │   └── email.ts             # Email, Mailbox, Kanban type definitions
│   └── mocks/                   # Mock API data for development
├── public/                      # Static assets, PWA manifest, icons
├── nginx/                       # Nginx reverse proxy config (Docker)
├── Dockerfile                   # Multi-stage Next.js build
├── docker-compose.yml           # Docker Compose for containerized deployment
├── vercel.json                  # Vercel deployment configuration
├── .env.example                 # Environment template
└── package.json
```

---

## Getting Started

### Prerequisites
- **Node.js 18+**
- **npm** or **yarn**
- Backend API running (see [mailboard-backend](https://github.com/tlavu2004/mailboard-backend))

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/tlavu2004/mailboard-frontend.git
cd mailboard-frontend

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
```

### Environment Configuration

Update `.env` with your Backend API URL and Google OAuth Client ID:

```env
NEXT_PUBLIC_API_URL=http://localhost:8080/api/v1
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-google-oauth-client-id
NEXT_PUBLIC_WS_URL=ws://localhost:8080/ws/notifications
```

**Getting Google OAuth Client ID:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select a project
3. Enable the Gmail API
4. Create OAuth 2.0 credentials (Web Application)
5. Add authorized origins: `http://localhost:3000`
6. Copy the Client ID to `.env`

### Running Locally

```bash
npm run dev
```

The application will be available at `http://localhost:3000`.

---

## Docker Setup

### Quick Start with Docker Compose

```bash
# 1. Configure environment
cp .env.example .env

# 2. Start the frontend
docker compose up -d

# 3. The frontend will be available at http://localhost:3000
```

### Useful Commands

```bash
# Start in background
docker compose up -d

# Rebuild after code changes
docker compose up -d --build

# View logs
docker compose logs -f

# Stop service
docker compose down
```

---

## Authentication Flow

### Token Management Strategy

| Storage | Token | Security | Persistence |
| :--- | :--- | :--- | :--- |
| **In-Memory + Backup** | Access Token | XSS-protected (primary in-memory) | Recovered from localStorage/cookie on reload |
| **localStorage** | Refresh Token | Mitigated by short access TTL + token rotation | Persists across refreshes |
| **Cookie** | Both (backup) | Fallback recovery | Cross-tab availability |

### Automatic Token Refresh

The Axios interceptor handles 401 responses transparently:
1. Queues concurrent requests during refresh (prevents race conditions).
2. Rotates refresh tokens on each refresh cycle.
3. Automatically redirects to `/login` on refresh failure.

---

## Deployment

### Vercel (Recommended)

This project is optimized for **Vercel**. Simply connect your GitHub repository and set the environment variables in the Vercel Dashboard:

```env
NEXT_PUBLIC_API_URL=https://your-backend.onrender.com/api/v1
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-google-client-id
NEXT_PUBLIC_WS_URL=wss://your-backend.onrender.com/ws/notifications
```

The included `vercel.json` handles API proxy rewrites and caching headers automatically.

### Docker (Self-Hosted)

Use the included multi-stage `Dockerfile` and `docker-compose.yml` with the Nginx reverse proxy for self-hosted deployments.

---

## Authors

| Student ID | Full Name | Github |
| :--- | :--- | :--- |
| **22120303** | Mai Xuân Quý | [m-xuanquy](https://github.com/m-xuanquy) |
| **22120430** | Lê Hoàng Việt | [Keruedu](https://github.com/Keruedu) |
| **22120443** | Trương Lê Anh Vũ | [tlavu2004](https://github.com/tlavu2004) |

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
