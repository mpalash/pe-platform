<template>
  <footer class="site-footer">
    <div class="center center--full">
      <Cluster
        justify="between"
        space="m"
      >
        <small><em>purgatory</em> <strong>EDIT</strong> — an experimental archive.</small>
        <small>
          <NuxtLink to="/disclaimers">Disclaimers</NuxtLink>
        </small>
      </Cluster>
    </div>
  </footer>
</template>

<style scoped>
.site-footer {
  border-block-start: 1px solid var(--rule);
  padding-block: var(--space-l);
  margin-block-start: var(--space-section);
}
</style>
