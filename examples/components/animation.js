import { motion } from 'framer-motion';

// Motion-based component using the built-in framer-motion module.
export const MotionCard = ({ title = 'Animated card' }) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            style={{ padding: 12, border: '1px solid #d0d7de', borderRadius: 8 }}
        >
            <strong>{title}</strong>
            <div>Motion comes from the built-in framer-motion module.</div>
        </motion.div>
    );
};
