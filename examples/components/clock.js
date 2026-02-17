import dayjs from 'https://esm.sh/dayjs@1.11.13';

export const Clock = () => {
    return <span>{dayjs().format('HH:mm')}</span>;
};
