class Dirgha < Formula
  desc "CLI coding agent — 17 providers, BYOK, local models, voice, image gen"
  homepage "https://dirgha.ai"
  license "FSL-1.1-MIT"
  version "1.25.9"

  depends_on "node"

  def install
    system "npm", "install", "-g", "@dirgha/code@#{version}"
    bin.install_symlink Dir["#{HOMEBREW_PREFIX}/lib/node_modules/@dirgha/code/dist/cli/main.js"]
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/dirgha --version")
  end
end
