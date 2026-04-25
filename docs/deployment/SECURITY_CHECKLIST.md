# Pre-Deployment Security Checklist

## ✅ Dependencies
- [ ] All versions pinned (no wildcards)
- [ ] `pnpm audit` passes
- [ ] No known CVEs in dependencies
- [ ] Weekly audit scheduled in CI

## ✅ Code Security
- [ ] Shell injection tests passing
- [ ] Secret redaction verified
- [ ] Trust level system active
- [ ] LibP2P limits configured

## ✅ Build Security
- [ ] No secrets in build output
- [ ] Source maps disabled for prod
- [ ] Minified and obfuscated
- [ ] Checksum generated

## ✅ Runtime Security
- [ ] Crash logs don't leak secrets
- [ ] Rate limiting enabled
- [ ] Input validation active
- [ ] Network isolation verified

## ✅ Documentation
- [ ] Security whitepaper complete
- [ ] Incident response plan
- [ ] Contact for security issues
- [ ] Bug bounty program (optional)

## Sign-off

| Role | Name | Date |
|------|------|------|
| Security Lead | | |
| Dev Lead | | |
| DevOps | | |
