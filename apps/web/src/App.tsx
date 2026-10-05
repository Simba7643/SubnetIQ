import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { useAuth } from '@/lib/auth';
import HomePage from '@/pages/HomePage';
const ToolsPage = lazy(() => import('@/features/calculators/ToolsPage'));
const ToolPage = lazy(() => import('@/features/calculators/ToolPage'));
const LearnPage = lazy(() => import('@/features/learning/LearnPage'));
const LessonPage = lazy(() => import('@/features/learning/LessonPage'));
const GlossaryPage = lazy(() => import('@/features/learning/GlossaryPage'));
const PracticePage = lazy(() => import('@/features/learning/PracticePage'));
const CheatsheetsPage = lazy(() => import('@/features/learning/CheatsheetsPage'));
const ToolkitPage = lazy(() => import('@/features/toolkit/ToolkitPage'));
const NetworkTemplatesPage = lazy(() => import('@/features/toolkit/NetworkTemplatesPage'));
const AuthPage = lazy(() => import('@/pages/AuthPage'));
const AccountPage = lazy(() => import('@/pages/AccountPage'));
const ProjectsPage = lazy(() => import('@/pages/ProjectsPage'));
const ProjectPage = lazy(() => import('@/pages/ProjectPage'));
const SharedProjectPage = lazy(() => import('@/pages/SharedProjectPage'));
const AssistantPage = lazy(() => import('@/pages/AssistantPage'));
const BlogPage = lazy(() => import('@/pages/BlogPage'));
const ArticlePage = lazy(() => import('@/pages/ArticlePage'));
const AboutPage = lazy(() => import('@/pages/AboutPage'));
const ContactPage = lazy(() => import('@/pages/ContactPage'));
const LegalPage = lazy(() => import('@/pages/LegalPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));

export default function App() {
  const { user } = useAuth();
  return (
    <Layout key={user?.id ?? 'guest'}>
      <Suspense
        fallback={
          <div className="loading-page" role="status">
            <span className="spinner" />
            Opening your workspace…
          </div>
        }
      >
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/tools" element={<ToolsPage />} />
          <Route path="/tools/:toolId" element={<ToolPage />} />
          <Route path="/learn" element={<LearnPage />} />
          <Route path="/learn/:lessonId" element={<LessonPage />} />
          <Route path="/glossary" element={<GlossaryPage />} />
          <Route path="/practice" element={<PracticePage />} />
          <Route path="/cheatsheets" element={<CheatsheetsPage />} />
          <Route path="/toolkit" element={<ToolkitPage />} />
          <Route path="/toolkit/:section" element={<ToolkitPage />} />
          <Route path="/templates" element={<NetworkTemplatesPage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/login" element={<Navigate to="/auth" replace />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:id" element={<ProjectPage />} />
          <Route path="/share/:token" element={<SharedProjectPage />} />
          <Route path="/assistant" element={<AssistantPage />} />
          <Route path="/blog" element={<BlogPage />} />
          <Route path="/blog/:articleId" element={<ArticlePage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/privacy" element={<LegalPage kind="privacy" />} />
          <Route path="/terms" element={<LegalPage kind="terms" />} />
          <Route path="/cookies" element={<LegalPage kind="cookies" />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}
