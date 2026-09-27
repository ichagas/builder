'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { azureOrgFromCollectionUri, azureRepositoryFullName, resolveRepositoryFullName } = require('../lib/repository');

test('azureOrgFromCollectionUri() handles dev.azure.com and visualstudio.com forms', () => {
  assert.equal(azureOrgFromCollectionUri('https://dev.azure.com/contoso/'), 'contoso');
  assert.equal(azureOrgFromCollectionUri('https://contoso.visualstudio.com/'), 'contoso');
  assert.equal(azureOrgFromCollectionUri('https://contoso.visualstudio.com/DefaultCollection/'), 'contoso');
  assert.throws(() => azureOrgFromCollectionUri('https://example.com/contoso/'));
  assert.throws(() => azureOrgFromCollectionUri(''));
});

test('azureRepositoryFullName() builds <adoOrg>/<project>/<repo>', () => {
  assert.equal(
    azureRepositoryFullName({ collectionUri: 'https://dev.azure.com/contoso/', project: 'My Project', repository: 'permits-api' }),
    'contoso/My Project/permits-api',
  );
  assert.throws(() => azureRepositoryFullName({ collectionUri: 'https://dev.azure.com/contoso/', project: '', repository: 'r' }));
  assert.throws(() => azureRepositoryFullName({ collectionUri: 'https://dev.azure.com/contoso/', project: 'p', repository: 'a/b' }));
});

test('resolveRepositoryFullName() sends the canonical full_name per provider', () => {
  // Azure Repos (TfsGit): Build.Repository.Name is only the repo name.
  assert.equal(
    resolveRepositoryFullName({
      repository: 'permits-api',
      'repository-provider': 'TfsGit',
      'azure-collection-uri': 'https://dev.azure.com/contoso/',
      'azure-project': 'Permits',
    }),
    'contoso/Permits/permits-api',
  );
  // GitHub repo built by Azure Pipelines: Build.Repository.Name is owner/repo.
  assert.equal(
    resolveRepositoryFullName({
      repository: 'goa/permits-api',
      'repository-provider': 'GitHub',
      'azure-collection-uri': 'https://dev.azure.com/contoso/',
      'azure-project': 'Permits',
    }),
    'goa/permits-api',
  );
  // GitHub Actions: no provider flag.
  assert.equal(resolveRepositoryFullName({ repository: 'goa/permits-api' }), 'goa/permits-api');
  // A bare repo name without the Azure flags is refused rather than sent (it
  // could never match application_repositories.full_name).
  assert.throws(() => resolveRepositoryFullName({ repository: 'permits-api' }), /<owner>\/<repo>/);
  assert.throws(() => resolveRepositoryFullName({ repository: 'permits-api', 'repository-provider': 'TfsGit' }));
});
