import { RouterProvider }      from 'react-router-dom'
import { GestoriaProvider } from '@/context/GestoriaContext'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { router }         from '@/router'
import BannerOffline     from '@/components/shared/BannerOffline'
import { useAuthListener } from '@/hooks/useAuth'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60 * 5, retry: 1 },
  },
})

function AuthProvider({ children }: { children: React.ReactNode }) {
  useAuthListener()
  return <>{children}</>
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <GestoriaProvider>
          <RouterProvider router={router} />
          <BannerOffline />
          <Toaster
          position="top-right"
          toastOptions={{
            duration: 3500,
            style: {
              fontFamily: 'var(--font-body)',
              fontSize: '13px',
              borderRadius: '12px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.10)',
              border: '1px solid #F3F4F6',
            },
            success: {
              iconTheme: { primary: '#D4621A', secondary: '#fff' },
            },
            error: {
              iconTheme: { primary: '#EF4444', secondary: '#fff' },
            },
          }}
        />
        </GestoriaProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}