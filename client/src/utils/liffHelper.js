
import liff from '@line/liff';

/**
 * Sends a message on behalf of the user to the chat where the LIFF app was opened.
 * Requires the LIFF app to be opened in a context that supports sending messages (e.g., 1-on-1 chat).
 * And requires the 'chat_message.write' scope.
 * 
 * @param {string} text - The text message to send
 * @returns {Promise<boolean>} - True if successful, False otherwise
 */
export const sendLiffMessage = async (text) => {
    try {
        // Initialize LIFF if not already initialized
        if (!liff.id) {
            await liff.init({ liffId: import.meta.env.VITE_LIFF_ID });
        }

        if (!liff.isLoggedIn()) {
            console.log('User not logged in, cannot send message');
            return false;
        }

        if (!liff.isInClient()) {
            console.log('Not in LINE client, cannot send message');
            // Alternatively, we could alert the user, but for "logging" purposes we just skip
            return false;
        }

        // Check for permission (optional but good practice)
        // const context = liff.getContext();
        // if (context && context.type === 'none') return false;

        await liff.sendMessages([
            {
                type: 'text',
                text: text
            }
        ]);
        console.log('Message sent:', text);
        return true;
    } catch (error) {
        console.error('Error sending LIFF message:', error);
        return false;
    }
};
