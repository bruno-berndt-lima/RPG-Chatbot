"use client";
import Image from "next/image";
import RPG_Logo from "./assets/RPG_Logo.png";
import { useChat } from "ai/react";
import { Message } from "ai";

import Bubble from "./components/Bubble";
import LoadingBubble from "./components/LoadingBubble";
import PromptSuggestionsRow from "./components/PromptSuggestionsRow";

const Home = () => {
    const { append, isLoading, messages, input, handleInputChange, handleSubmit } = useChat();

    const noMessages = !messages || messages.length === 0;

    const handlePrompt = (promptText) => {
        const message: Message = {
            id: crypto.randomUUID(),
            content: promptText,
            role: "user",
        }
        append(message);
    }

    return (
        <main>
            <Image src={RPG_Logo} alt="RPG Logo" width={250}/>
            <section className={noMessages ? "" : "populated"}>
                {noMessages ? (
                    <>
                        <p className="starter-text">
                            The ultimate place for RPG super fans! 
                            Ask RPG Chatbot anything about you need to know and it will come back
                            with the most up-to-date information.
                        </p>
                        <br/>
                        <PromptSuggestionsRow onPromptClick={handlePrompt}/>
                    </>
                ) : (
                    <>
                        {messages.map((message, index) => <Bubble key={`message-${index}`} message={message}/>)}
                        {isLoading && <LoadingBubble/>}
                    </>
                )}
            </section>
            <form onSubmit={handleSubmit}>
                <input className="question-box" onChange={handleInputChange} value={input} placeholder="Ask me anything about RPGs"/>
                <input type="submit"/>
            </form>
        </main>
    )
}

export default Home;