<?php

/**
 * Symfony: SUQO webhook controller.
 *
 * Exclude the path from any firewall that would challenge an unauthenticated
 * POST, and from anything that reads the request body first.
 *
 * Targets Symfony 6.4+ / 7.x: Routing\Attribute\Route and the #[Autowire]
 * attribute both exist there. On 6.1–6.3 import
 * Symfony\Component\Routing\Annotation\Route instead; below 6.1 there is no
 * #[Autowire], so use the YAML binding.
 *
 * A scalar constructor argument is not autowired: without #[Autowire] the
 * container fails to compile with "Cannot autowire service ... argument
 * $webhookSecret is type-hinted string". If you prefer YAML, drop the
 * attribute and bind it in config/services.yaml instead:
 *
 *   services:
 *       App\Controller\SuqoWebhookController:
 *           arguments:
 *               $webhookSecret: '%env(SUQO_WEBHOOK_SECRET)%'
 */

declare(strict_types=1);

namespace App\Controller;

use Psr\Log\LoggerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Messenger\MessageBusInterface;
use Symfony\Component\Routing\Attribute\Route;
use Suqo\Webhook;

final class SuqoWebhookController extends AbstractController
{
    public function __construct(
        private readonly MessageBusInterface $bus,
        private readonly LoggerInterface $logger,
        #[Autowire('%env(SUQO_WEBHOOK_SECRET)%')]
        private readonly string $webhookSecret,
    ) {
    }

    #[Route('/webhooks/suqo', name: 'suqo_webhook', methods: ['POST'])]
    public function __invoke(Request $request): Response
    {
        // Raw bytes — never a re-serialised parse.
        $raw = $request->getContent();

        if ($this->webhookSecret === '') {
            $this->logger->critical('SUQO webhook secret is not configured');

            return new Response('', Response::HTTP_INTERNAL_SERVER_ERROR);
        }

        // Standalone: no client, no API key, no network. Never throws.
        $verified = Webhook::verify(
            rawBody: $raw,
            signature: $request->headers->get('X-Suqo-Signature'),
            timestamp: $request->headers->get('X-Suqo-Timestamp'),
            secret: $this->webhookSecret,
        );

        if (!$verified) {
            $this->logger->warning('SUQO webhook failed verification');

            return new Response('', Response::HTTP_BAD_REQUEST);
        }

        $event = json_decode($raw, true);

        if (!is_array($event)) {
            return new Response('', Response::HTTP_BAD_REQUEST);
        }

        // Acknowledge fast, process async. The handler must be idempotent.
        $this->bus->dispatch(new \App\Message\SuqoWebhookReceived($event));

        return new Response('', Response::HTTP_OK);
    }
}
