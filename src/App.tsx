import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Home } from './pages/Home'
import { Launch } from './pages/Launch'
import { Token } from './pages/Token'
import { Rules } from './pages/Rules'
import { NotFound } from './pages/NotFound'

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/launch', element: <Launch /> },
      { path: '/token/:mint', element: <Token /> },
      { path: '/rules', element: <Rules /> },
      { path: '*', element: <NotFound /> },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
