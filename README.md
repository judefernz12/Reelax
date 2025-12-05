# Reelax 🎬

A real-time collaborative movie streaming platform that lets you watch movies together with friends. Built with Next.js 16, React 19, AgoraSDK and Supabase.

> **Watch together, stay connected** - Synchronized playback, real-time chat, and video calls all in one place.

---

## 🌟 Features

### ✅ Completed Features
- **User Authentication** - Secure login with Google OAuth 2.0
- **Friends System** - Search users, send/accept friend requests
- **Room Management** - Create rooms, invite friends, configurable permissions
- **Real-Time Notifications** - Instant friend requests and room invitations
- **Responsive UI** - Works seamlessly on desktop and tablet
- **Dark/Light Theme** - Customizable theme
- **Video Player** -  with standard controls
- **Video Synchronization** - Timestamp-based sync with latency compensation
- **Real-Time Chat** - Text messaging with emoji support and message history
- **Video/Voice Calls** - AgoraSDK integration for face-to-face communication

---

## 🛠️ Tech Stack

### Frontend
- **Next.js 16** - React framework with SSR/SSG
- **React 19** - UI library with latest features
- **Tailwind CSS 3** - Utility-first styling
- **Supabase Client** - Real-time subscriptions and authentication
- **AgoraSDK** - Face-to-face communication

### Backend
- **Next.js API Routes** - Serverless functions
- **Supabase** - PostgreSQL database, authentication, and real-time services
- **PostgreSQL 15** - Relational database with Row-Level Security

### Authentication & Security
- **Google OAuth 2.0** - Secure authentication
- **Row-Level Security (RLS)** - Database-level access control

---

## 📋 Prerequisites

Before you begin, ensure you have the following installed:
- **Node.js** (v18.0 or higher)
- **npm** (v9.0 or higher)
- **Git**
- A **Supabase account** (free tier is sufficient)
- A **Google Cloud account** (for OAuth setup)

---

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/judefernz12/Reelax.git
cd reelax
```

### 2. Install Dependencies

```bash
npm install
```

This will install all required packages including:
- Next.js, React, Agora js and related dependencies
- Supabase client libraries
- Tailwind CSS and its dependencies
- All other project dependencies

**Note:** If you encounter any peer dependency warnings, you can safely ignore them or run:
```bash
npm install --legacy-peer-deps
```

### 3. Set Up Environment Variables

Create a `.env.local` file in the root directory:

```bash
touch .env.local
```

Add the following environment variables:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Agora Configuration
NEXT_PUBLIC_AGORA_APP_ID=your_agora_app_id
```

---

## 👥 Authors

**Jude Fernandes**
**Kameshwara Karthik Ayyalasomayajula**
---

## 🙏 Acknowledgments

- **Next.js** - The React framework for production
- **Supabase** - Backend-as-a-service platform
- **Tailwind CSS** - Utility-first CSS framework
- **AgoraSDK** - Video/Audio Interaction

---

## 🔗 Links

- **GitHub Repository:** [https://github.com/judefernz12/Reelax.git]

---

Made with ❤️ and Next.js

---

**Reelax and Happy streaming!🎬🍿**
