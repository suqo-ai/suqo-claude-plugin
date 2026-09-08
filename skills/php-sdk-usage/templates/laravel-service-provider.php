<?php

/**
 * Laravel: bind SuqoClient as a singleton.
 *
 * Place at app/Providers/SuqoServiceProvider.php and register it. Add to
 * config/services.php:
 *
 *   'suqo' => [
 *       'key' => env('SUQO_API_KEY'),
 *       'timeout' => env('SUQO_TIMEOUT', 10.0),
 *       'max_retries' => env('SUQO_MAX_RETRIES', 2),
 *       'webhook_secret' => env('SUQO_WEBHOOK_SECRET'),
 *   ],
 *
 * Then inject SuqoClient into a controller, job or listener constructor. Never
 * call new SuqoClient() inside an action — it re-reads config per request and
 * hides misconfiguration until traffic arrives.
 */

declare(strict_types=1);

namespace App\Providers;

use Illuminate\Contracts\Foundation\Application;
use Illuminate\Support\ServiceProvider;
use Suqo\Exception\SuqoConfigError;
use Suqo\SuqoClient;

final class SuqoServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        // Singleton: immutable, no connection held, no request on construction.
        $this->app->singleton(SuqoClient::class, static function (Application $app): SuqoClient {
            try {
                return new SuqoClient(
                    apiKey: (string) config('services.suqo.key'),
                    // Per attempt, and it multiplies by retries. Keep it short in
                    // a request path; raise it in a queue worker.
                    timeout: (float) config('services.suqo.timeout', 10.0),
                    maxRetries: (int) config('services.suqo.max_retries', 2),
                    logLevel: $app->hasDebugModeEnabled() ? 'debug' : 'warn',
                );
            } catch (SuqoConfigError $e) {
                // SuqoConfigError extends \InvalidArgumentException, so a
                // catch (SuqoError) elsewhere will not see it.
                throw new \RuntimeException('SUQO is misconfigured: ' . $e->getMessage(), 0, $e);
            }
        });
    }

    /**
     * Fail fast on a missing or malformed key in a console context (queue
     * workers, scheduled commands) rather than inside the first job.
     *
     * Skipped for the build/cache commands only: `composer install` runs
     * `package:discover`, and CI runs `config:cache` / `route:cache`, usually
     * with no SUQO_API_KEY at all, so an unconditional make() would abort
     * every one of those. Every other console command — `queue:work` above
     * all — still resolves the client here, so a broken deploy fails at boot
     * instead of inside a job.
     */
    public function boot(): void
    {
        if (! $this->app->runningInConsole()) {
            return;
        }

        // These legitimately run without application credentials.
        $buildCommands = [
            'package:discover',
            'config:cache',
            'config:clear',
            'route:cache',
            'route:clear',
            'optimize',
            'optimize:clear',
        ];

        $command = $_SERVER['argv'][1] ?? '';

        if (! in_array($command, $buildCommands, true)) {
            $this->app->make(SuqoClient::class);
        }
    }
}
