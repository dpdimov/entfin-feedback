export const metadata = {
  title: "Pitch Evaluation Feedback",
  description: "Formative feedback tool for university startup funding pitch evaluation",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
