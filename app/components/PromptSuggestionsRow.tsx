import PromptSuggestionButton from "./PromptSuggestionButton";

const PromptSuggestionsRow = ({onPromptClick}) => {
    const prompts = [
        "What is the rule of initiative in D&D 5e?",
        "What is a basilisk?",
        "What is the stats of Fireball in D&D 5e?",
        "How do I make a character in D&D 5e?",
    ]

    return (
        <div className="prompt-suggestions-row">
            {prompts.map((prompt, index) => 
                <PromptSuggestionButton 
                    key={`suggestion-${index}`} 
                    text={prompt} 
                    onClick={() => onPromptClick(prompt)}
                />
            )}
        </div>
    )
}

export default PromptSuggestionsRow;