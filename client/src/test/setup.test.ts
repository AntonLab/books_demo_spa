describe('window.getComputedStyle in the test setup', () => {
  afterEach(() => jest.restoreAllMocks());

  it('answers a pseudo-element call without a jsdom error', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const style = window.getComputedStyle(document.body, '::before');
    expect(spy).not.toHaveBeenCalled();
    expect(style.display).toBe(window.getComputedStyle(document.body).display);
  });

  it('still answers a plain call and an undefined pseudo-element', () => {
    const el = document.createElement('div');
    el.style.color = 'red';
    document.body.append(el);
    expect(window.getComputedStyle(el).color).toBe('rgb(255, 0, 0)');
    expect(window.getComputedStyle(el, undefined).color).toBe('rgb(255, 0, 0)');
    el.remove();
  });
});
