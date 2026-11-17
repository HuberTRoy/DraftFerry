export async function confirmPostWithoutTags(page) {
  const confirmation = page.getByRole('dialog').filter({ hasText: 'Post without tags?' });
  try {
    await confirmation.waitFor({ state: 'visible', timeout: 5000 });
  } catch (error) {
    if (error.name === 'TimeoutError') return false;
    throw error;
  }
  await confirmation.getByRole('button', { name: 'Post', exact: true }).click();
  return true;
}
