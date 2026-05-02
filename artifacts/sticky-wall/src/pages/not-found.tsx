export default function NotFound() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background text-foreground">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">404</h1>
        <p className="text-foreground/60">This page doesn&rsquo;t exist.</p>
      </div>
    </div>
  );
}
