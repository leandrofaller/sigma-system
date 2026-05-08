export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-sigma-950 to-gray-900">
      {children}
    </div>
  );
}
