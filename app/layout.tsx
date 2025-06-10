import "./global.css";

export const metadata = {
    title: "RPG Chatbot",
    description: "The place to go for all your RPG questions",
}

const RootLayout = ({ children }) => {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    )
}

export default RootLayout;