export function typewriter(node: HTMLElement, speed: number = 45) {
    const text = (node.textContent ?? '').trim();
    node.textContent = '';

    let i = 0;
    const timer = setInterval(() => {
        node.textContent = text.slice(0, ++i);
        if (i >= text.length) clearInterval(timer);
    }, speed);

    return { destroy: () => clearInterval(timer) };
}
