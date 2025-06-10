"use client";
import Image from "next/image";
import RPG_Logo from "./assets/RPG_Logo.png";
import { useState, useRef, useEffect } from "react";

import Bubble from "./components/Bubble";
import LoadingBubble from "./components/LoadingBubble";
import PromptSuggestionsRow from "./components/PromptSuggestionsRow";

const Home = () => {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isLoading]);

    const sendMessage = async (content) => {
        const userMessage = {
            id: crypto.randomUUID(),
            content: content,
            role: "user",
        };

        setMessages(prev => [...prev, userMessage]);
        setIsLoading(true);
        setError(null);

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    messages: [...messages, userMessage]
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            const assistantMessage = {
                id: crypto.randomUUID(),
                content: data.choices[0].message.content,
                role: "assistant",
            };

            setMessages(prev => [...prev, assistantMessage]);
        } catch (err) {
            console.error('Chat error:', err);
            setError(err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (input.trim() && !isLoading) {
            sendMessage(input);
            setInput("");
        }
    };

    const handlePrompt = (promptText) => {
        console.log('Sending prompt:', promptText);
        sendMessage(promptText);
    };

    const noMessages = !messages || messages.length === 0;

    return (
        <main>
            <Image src={RPG_Logo} alt="RPG Logo" width={250}/>
            <section className={noMessages ? "" : "populated"}>
                {noMessages ? (
                    <>
                        <p className="starter-text">
                            RPG Chatbot is your ultimate guide for lore, rules, monsters, spells, 
                            and storytelling — everything you need to power your adventures! 
                            Ready to begin?
                        </p>
                        <br/>
                        <PromptSuggestionsRow onPromptClick={handlePrompt}/>
                    </>
                ) : (
                    <>
                        <div style={{ flexGrow: 1 }} />
                        {messages.map((message, index) => <Bubble key={`message-${index}`} message={message}/>)}
                        {isLoading && <LoadingBubble/>}
                        {error && <div className="error-message">Error: {error.message}</div>}
                        <div ref={messagesEndRef} />
                    </>
                )}
            </section>
            <form onSubmit={handleSubmit}>
                <input 
                    className="question-box" 
                    onChange={(e) => setInput(e.target.value)} 
                    value={input} 
                    placeholder="Ask me anything about RPGs"
                    disabled={isLoading}
                />
                <input type="submit" disabled={isLoading}/>
            </form>
        </main>
    )
}

export default Home;